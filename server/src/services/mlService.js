import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { buildHistoricalProfiles, enrichQueueWithPredictions } from './analyticsEngine.js'

const ACTIVE_QUEUE_STATUSES = new Set(['waiting', 'serving'])
const MIN_REGRESSION_SAMPLES = Number(process.env.QUEUE_ML_MIN_REGRESSION_SAMPLES || 5)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ML_SCRIPT = path.resolve(__dirname, '..', '..', 'ml', 'predict_queue.py')

function parseStartMinutes(slotTime = '') {
  const match = String(slotTime).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!match) return 10 * 60
  let hour = Number(match[1]) % 12
  const minute = Number(match[2])
  const meridian = match[3].toUpperCase()
  if (meridian === 'PM') hour += 12
  return hour * 60 + minute
}

function hourOfDay(slotTime = '') {
  return Math.floor(parseStartMinutes(slotTime) / 60)
}

function avg(values = []) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function buildEventIndex(queueEvents = []) {
  return queueEvents.reduce((acc, event) => {
    if (!event?.token_id) return acc
    acc[event.token_id] ||= []
    acc[event.token_id].push(event)
    return acc
  }, {})
}

function inferServiceMinutesDetailed(tokenRow = {}, eventIndex = {}) {
  const directStart = tokenRow.service_started_at ? new Date(tokenRow.service_started_at).getTime() : null
  const directEnd = tokenRow.service_completed_at ? new Date(tokenRow.service_completed_at).getTime() : null
  if (directStart && directEnd && directEnd > directStart) {
    return {
      serviceMinutes: clamp((directEnd - directStart) / 60000, 1, 180),
      source: 'lifecycle-columns',
    }
  }

  const events = eventIndex[tokenRow.id] || []
  const startEvent = events.find((event) => event.event_type === 'procurement-started' || event.event_type === 'called')
  const endEvent = [...events].reverse().find((event) => event.event_type === 'procurement-completed')
  if (startEvent?.created_at && endEvent?.created_at) {
    const startedAt = new Date(startEvent.created_at).getTime()
    const completedAt = new Date(endEvent.created_at).getTime()
    if (completedAt > startedAt) {
      return {
        serviceMinutes: clamp((completedAt - startedAt) / 60000, 1, 180),
        source: 'queue-events',
      }
    }
  }

  return {
    serviceMinutes: null,
    source: null,
  }
}

function buildHistoryAggregates(bundle = {}) {
  const procurementByToken = Object.fromEntries((bundle.procurements || []).map((row) => [row.token_id, row]))
  const centreLookup = Object.fromEntries((bundle.centres || []).map((row) => [row.id, row]))
  const buckets = new Map()

  for (const token of bundle.tokens || []) {
    const procurement = procurementByToken[token.id] || {}
    const key = `${token.centre_id}::${hourOfDay(token.slot_time)}`
    if (!buckets.has(key)) {
      const centre = centreLookup[token.centre_id] || {}
      buckets.set(key, {
        centre_id: token.centre_id,
        hour_of_day: hourOfDay(token.slot_time),
        bookings_count: 0,
        completed_count: 0,
        no_show_count: 0,
        skipped_count: 0,
        checked_in_count: 0,
        total_quantity_kg: 0,
        avg_quantity_kg: 0,
        completion_rate: 0,
        centre_capacity: Number(centre.capacity || 0),
      })
    }
    const bucket = buckets.get(key)
    bucket.bookings_count += 1
    if (token.queue_status === 'completed') bucket.completed_count += 1
    if (token.queue_status === 'no-show') bucket.no_show_count += 1
    if (token.queue_status === 'skipped') bucket.skipped_count += 1
    if (token.check_in_status === 'checked-in') bucket.checked_in_count += 1
    bucket.total_quantity_kg += Number(procurement.quantity || 0)
  }

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    avg_quantity_kg: bucket.bookings_count ? Number((bucket.total_quantity_kg / bucket.bookings_count).toFixed(3)) : 0,
    completion_rate: bucket.bookings_count ? Number((bucket.completed_count / bucket.bookings_count).toFixed(3)) : 0,
  }))
}

function buildTrainingRows(bundle = {}, activeQueue = []) {
  const procurementByToken = Object.fromEntries((bundle.procurements || []).map((row) => [row.token_id, row]))
  const aggregates = buildHistoryAggregates(bundle)
  const aggregateMap = new Map(aggregates.map((row) => [`${row.centre_id}::${row.hour_of_day}`, row]))
  const eventIndex = buildEventIndex(bundle.queueEvents || [])
  const currentLoadByCentre = (activeQueue || []).reduce((acc, row) => {
    if (!ACTIVE_QUEUE_STATUSES.has(row.queueStatus)) return acc
    acc[row.centreId] = (acc[row.centreId] || 0) + 1
    return acc
  }, {})

  return (bundle.tokens || []).map((token) => {
    const procurement = procurementByToken[token.id] || {}
    const hour = hourOfDay(token.slot_time)
    const aggregate = aggregateMap.get(`${token.centre_id}::${hour}`) || {}
    const inferred = inferServiceMinutesDetailed(token, eventIndex)
    return {
      centre_id: token.centre_id,
      crop: procurement.crop || 'Unknown',
      hour_of_day: hour,
      quantity_kg: Number(procurement.quantity || 0),
      check_in_flag: token.check_in_status === 'checked-in' ? 1 : 0,
      centre_active_load: Number(currentLoadByCentre[token.centre_id] || 0),
      hour_active_load: Number((activeQueue || []).filter((row) => row.centreId === token.centre_id && hourOfDay(row.slot) === hour && ACTIVE_QUEUE_STATUSES.has(row.queueStatus)).length),
      bookings_count: Number(aggregate.bookings_count || 0),
      completion_rate: Number(aggregate.completion_rate || 0),
      service_minutes: inferred.serviceMinutes,
      duration_source: inferred.source,
    }
  }).filter((row) => row.service_minutes)
}

function buildActiveRows(queue = [], bundle = {}) {
  const procurementByToken = Object.fromEntries((bundle.procurements || []).map((row) => [row.token_id, row]))
  const centreLookup = Object.fromEntries((bundle.centres || []).map((row) => [row.id, row]))
  const historyAggregates = buildHistoryAggregates(bundle)
  const activeOrdered = queue.filter((row) => ACTIVE_QUEUE_STATUSES.has(row.queueStatus))

  return activeOrdered.map((row, index) => {
    const procurement = procurementByToken[row.id] || {}
    const hour = hourOfDay(row.slot)
    const aggregate = historyAggregates.find((item) => item.centre_id === row.centreId && item.hour_of_day === hour)
      || historyAggregates.find((item) => item.centre_id === row.centreId)
      || { bookings_count: 0, completed_count: 0, no_show_count: 0, skipped_count: 0, checked_in_count: 0, avg_quantity_kg: 0, completion_rate: 0 }
    const centre = centreLookup[row.centreId] || {}
    const sameCentreActive = activeOrdered.filter((item) => item.centreId === row.centreId)
    const sameHourActive = sameCentreActive.filter((item) => hourOfDay(item.slot) === hour)
    const quantities = sameCentreActive.map((item) => Number(procurementByToken[item.id]?.quantity || item.quantityKg || 0))

    return {
      id: row.id,
      queue_status: row.queueStatus,
      order_index: index,
      centre_id: row.centreId,
      crop: procurement.crop || row.crop || 'Unknown',
      hour_of_day: hour,
      quantity_kg: Number(procurement.quantity || row.quantityKg || 0),
      check_in_flag: row.checkIn === 'checked-in' ? 1 : 0,
      centre_active_load: sameCentreActive.length,
      hour_active_load: sameHourActive.length,
      bookings_count: Number(aggregate.bookings_count || sameCentreActive.length),
      completed_count: Number(aggregate.completed_count || 0),
      no_show_count: Number(aggregate.no_show_count || 0),
      skipped_count: Number(aggregate.skipped_count || 0),
      checked_in_count: sameCentreActive.filter((item) => item.checkIn === 'checked-in').length,
      avg_quantity_kg: Number((avg(quantities) || aggregate.avg_quantity_kg || 0).toFixed(3)),
      completion_rate: Number(aggregate.completion_rate || 0),
      centre_capacity: Number(centre.capacity || 0),
    }
  })
}

function runPythonPrediction(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [ML_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `ML prediction process exited with code ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout || '{}'))
      } catch (error) {
        reject(new Error(`Unable to parse ML output: ${error.message}`))
      }
    })

    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

function buildDiagnosticsBase(bundle = {}, activeRows = [], trainingRows = []) {
  const lifecycleSamples = trainingRows.filter((row) => row.duration_source === 'lifecycle-columns').length
  const eventDerivedSamples = trainingRows.filter((row) => row.duration_source === 'queue-events').length
  const regressionReady = trainingRows.length >= MIN_REGRESSION_SAMPLES
  return {
    queueEventCount: (bundle.queueEvents || []).length,
    activePredictionCount: activeRows.length,
    clusterSamples: buildHistoryAggregates(bundle).length,
    regressionSamples: trainingRows.length,
    lifecycleSamples,
    eventDerivedSamples,
    regressionMinimum: MIN_REGRESSION_SAMPLES,
    regressionReady,
    fallbackReason: regressionReady ? null : `Need at least ${MIN_REGRESSION_SAMPLES} labeled completed runs; only ${trainingRows.length} available.`,
  }
}

export async function enrichQueueWithMlPredictions(queue = [], bundle = {}) {
  const sortedQueue = [...queue]
  const historyRows = buildHistoryAggregates(bundle)
  const trainingRows = buildTrainingRows(bundle, sortedQueue)
  const activeRows = buildActiveRows(sortedQueue, bundle)
  const diagnosticsBase = buildDiagnosticsBase(bundle, activeRows, trainingRows)
  const fallbackProfiles = buildHistoricalProfiles({
    tokens: bundle.tokens || [],
    procurements: bundle.procurements || [],
    crops: bundle.crops || [],
    centres: bundle.centres || [],
    queueEvents: bundle.queueEvents || [],
    activeQueue: sortedQueue,
  })
  const fallbackQueue = enrichQueueWithPredictions(sortedQueue, fallbackProfiles)

  if (!activeRows.length) {
    return {
      queue: fallbackQueue,
      profiles: fallbackProfiles,
      diagnostics: {
        model: 'historical-heuristic',
        ...diagnosticsBase,
      },
    }
  }

  try {
    const result = await runPythonPrediction({
      history_rows: historyRows,
      training_rows: trainingRows,
      active_rows: activeRows,
    })

    const predictionMap = new Map((result.predictions || []).map((row) => [String(row.id), row]))
    const merged = fallbackQueue.map((row) => {
      const predicted = predictionMap.get(String(row.id))
      if (!predicted) return row
      return {
        ...row,
        farmersAhead: Number(predicted.farmers_ahead ?? row.farmersAhead ?? 0),
        estimatedWaitMinutes: Number(predicted.estimated_wait_minutes ?? row.estimatedWaitMinutes ?? 0),
        predictedServiceMinutes: Number(predicted.predicted_service_minutes ?? row.predictedServiceMinutes ?? 0),
        predictionSource: predicted.prediction_source || 'historical-heuristic',
        loadCluster: predicted.load_cluster || null,
        loadClusterId: predicted.cluster_id ?? null,
      }
    })

    const resolvedModel = result.diagnostics?.model || 'historical-heuristic'
    return {
      queue: merged,
      profiles: {
        ...fallbackProfiles,
        mlModel: resolvedModel,
      },
      diagnostics: {
        model: resolvedModel,
        trainR2: result.diagnostics?.train_r2 ?? null,
        clusters: result.diagnostics?.clusters || {},
        ...diagnosticsBase,
      },
    }
  } catch (error) {
    return {
      queue: fallbackQueue,
      profiles: fallbackProfiles,
      diagnostics: {
        model: 'historical-heuristic',
        error: error.message,
        ...diagnosticsBase,
      },
    }
  }
}
