function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function parseStartMinutes(slotTime = '') {
  const match = String(slotTime).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (!match) return null
  let hour = Number(match[1]) % 12
  const minute = Number(match[2])
  const meridian = match[3].toUpperCase()
  if (meridian === 'PM') hour += 12
  return hour * 60 + minute
}

function hourLabelFromMinutes(minutes) {
  if (minutes == null) return 'Unknown'
  const hour = Math.floor(minutes / 60)
  const meridian = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  const nextHour = (hour + 1) % 24
  const nextMeridian = nextHour >= 12 ? 'PM' : 'AM'
  const nextHour12 = nextHour % 12 || 12
  return `${hour12} ${meridian} - ${nextHour12} ${nextMeridian}`
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function pseudoDurationFromProcurement(procurement = {}, cropBasePrice = 0) {
  const quantity = Number(procurement.quantity || 0)
  const priceFactor = cropBasePrice ? clamp(cropBasePrice / 2500, 0.8, 2.2) : 1
  const quantityFactor = clamp(quantity / 120, 0, 18)
  return clamp(6 + quantityFactor + priceFactor, 6, 36)
}

function buildEventIndex(queueEvents = []) {
  return queueEvents.reduce((acc, event) => {
    if (!event?.token_id) return acc
    acc[event.token_id] ||= []
    acc[event.token_id].push(event)
    return acc
  }, {})
}

function inferActualDuration(tokenRow = {}, eventIndex = {}) {
  const directStart = tokenRow.service_started_at ? new Date(tokenRow.service_started_at).getTime() : null
  const directEnd = tokenRow.service_completed_at ? new Date(tokenRow.service_completed_at).getTime() : null
  if (directStart && directEnd && directEnd > directStart) {
    return clamp((directEnd - directStart) / 60000, 1, 180)
  }

  const events = eventIndex[tokenRow.id] || []
  const startEvent = events.find((event) => event.event_type === 'procurement-started' || event.event_type === 'called')
  const endEvent = [...events].reverse().find((event) => event.event_type === 'procurement-completed')
  if (startEvent?.created_at && endEvent?.created_at) {
    const startedAt = new Date(startEvent.created_at).getTime()
    const completedAt = new Date(endEvent.created_at).getTime()
    if (completedAt > startedAt) return clamp((completedAt - startedAt) / 60000, 1, 180)
  }

  return null
}

export function buildHistoricalProfiles({ tokens = [], procurements = [], crops = [], centres = [], queueEvents = [], activeQueue = [] }) {
  const cropPrice = Object.fromEntries(crops.map((crop) => [String(crop.name || '').toLowerCase(), Number(crop.base_price || 0)]))
  const procurementByToken = Object.fromEntries(procurements.map((row) => [row.token_id, row]))
  const eventIndex = buildEventIndex(queueEvents)

  const completedQueueRows = tokens.filter((row) => row.queue_status === 'completed')
  const durations = completedQueueRows.map((row) => {
    const procurement = procurementByToken[row.id] || {}
    const actualDuration = inferActualDuration(row, eventIndex)
    const fallbackDuration = pseudoDurationFromProcurement(procurement, cropPrice[String(procurement.crop || '').toLowerCase()])
    return {
      centreId: row.centre_id,
      slotTime: row.slot_time,
      crop: String(procurement.crop || '').toLowerCase(),
      duration: actualDuration ?? fallbackDuration,
      durationSource: actualDuration != null ? 'recorded-lifecycle' : 'procurement-heuristic',
    }
  })

  const globalAvg = avg(durations.map((row) => row.duration)) || 10
  const centreProfiles = {}
  const cropProfiles = {}
  const hourProfiles = {}
  const actualDurationCount = durations.filter((row) => row.durationSource === 'recorded-lifecycle').length

  durations.forEach((row) => {
    centreProfiles[row.centreId] ||= []
    centreProfiles[row.centreId].push(row.duration)
    if (row.crop) {
      cropProfiles[row.crop] ||= []
      cropProfiles[row.crop].push(row.duration)
    }
    const start = parseStartMinutes(row.slotTime)
    const hourLabel = hourLabelFromMinutes(start)
    hourProfiles[hourLabel] ||= []
    hourProfiles[hourLabel].push(row.duration)
  })

  const activeWaitingCount = activeQueue.filter((row) => row.queueStatus === 'waiting').length
  const centreCapacity = centres.reduce((sum, row) => sum + Number(row.capacity || 0), 0) || 1
  const liveCongestionRatio = activeWaitingCount / centreCapacity

  const hourDemand = {}
  tokens.forEach((row) => {
    const start = parseStartMinutes(row.slot_time)
    const hourLabel = hourLabelFromMinutes(start)
    hourDemand[hourLabel] = (hourDemand[hourLabel] || 0) + 1
  })

  const peakHourEntry = Object.entries(hourDemand).sort((a, b) => b[1] - a[1])[0]
  const peakHour = peakHourEntry?.[0] || '10 AM - 11 AM'

  return {
    globalAvgServiceMinutes: Number(globalAvg.toFixed(1)),
    centreAvg: Object.fromEntries(Object.entries(centreProfiles).map(([key, values]) => [key, Number(avg(values).toFixed(1))])),
    cropAvg: Object.fromEntries(Object.entries(cropProfiles).map(([key, values]) => [key, Number(avg(values).toFixed(1))])),
    hourAvg: Object.fromEntries(Object.entries(hourProfiles).map(([key, values]) => [key, Number(avg(values).toFixed(1))])),
    peakHour,
    congestionLevel: liveCongestionRatio > 0.4 ? 'High' : liveCongestionRatio > 0.2 ? 'Moderate' : 'Low',
    congestionScore: Number(clamp(liveCongestionRatio * 100, 0, 100).toFixed(1)),
    medianCompletedServiceMinutes: Number(median(durations.map((row) => row.duration)).toFixed(1)) || 10,
    recordedLifecycleSamples: actualDurationCount,
    totalCompletedSamples: durations.length,
  }
}

export function estimateServiceMinutes(queueRow, profiles) {
  const hourLabel = hourLabelFromMinutes(parseStartMinutes(queueRow.slot || queueRow.slot_time))
  const cropKey = String(queueRow.crop || '').toLowerCase()
  const centreBase = profiles.centreAvg[queueRow.centreId] || profiles.globalAvgServiceMinutes
  const cropBase = profiles.cropAvg[cropKey] || centreBase
  const hourBase = profiles.hourAvg[hourLabel] || centreBase
  const quantityFactor = clamp(Number(queueRow.quantityKg || queueRow.quantity || 0) / 150, 0, 6)
  const checkedInAdjustment = queueRow.checkIn === 'checked-in' ? -0.6 : 0.8
  const weighted = (centreBase * 0.45) + (cropBase * 0.25) + (hourBase * 0.2) + (profiles.medianCompletedServiceMinutes * 0.1)
  return Number(clamp(weighted + quantityFactor + checkedInAdjustment, 5, 40).toFixed(1))
}

export function enrichQueueWithPredictions(queue, profiles) {
  const activeOrdered = queue.filter((row) => row.queueStatus === 'serving' || row.queueStatus === 'waiting')
  return queue.map((row) => {
    if (row.queueStatus === 'completed') return { ...row, farmersAhead: 0, estimatedWaitMinutes: 0, predictionSource: 'historical-heuristic' }
    if (row.queueStatus === 'skipped' || row.queueStatus === 'no-show') return { ...row, farmersAhead: 0, estimatedWaitMinutes: 0, predictionSource: 'historical-heuristic' }

    const index = activeOrdered.findIndex((item) => item.id === row.id)
    const ahead = activeOrdered.slice(0, index).filter((item) => item.queueStatus === 'waiting' || item.queueStatus === 'serving')
    const predictedWait = ahead.reduce((sum, item) => sum + estimateServiceMinutes(item, profiles), 0)
    return {
      ...row,
      farmersAhead: Math.max(0, ahead.length),
      estimatedWaitMinutes: Number(predictedWait.toFixed(1)),
      predictedServiceMinutes: estimateServiceMinutes(row, profiles),
      predictionSource: 'historical-heuristic',
    }
  })
}

export function buildAnalyticsBundle({ farmers = [], procurements = [], tokens = [], centres = [], queue = [], crops = [], queueEvents = [], mlDiagnostics = {} }) {
  const profiles = buildHistoricalProfiles({ tokens, procurements, crops, centres, queueEvents, activeQueue: queue })
  const dates = [...new Set(procurements.map((row) => row.date).filter(Boolean))].sort().slice(-7)
  const cropCounts = procurements.reduce((acc, row) => {
    acc[row.crop] = (acc[row.crop] || 0) + 1
    return acc
  }, {})
  const villageCounts = farmers.reduce((acc, row) => {
    acc[row.village] = (acc[row.village] || 0) + 1
    return acc
  }, {})
  const centrePerformance = centres.map((centre) => {
    const centreQueue = queue.filter((row) => row.centreId === centre.id)
    const waiting = centreQueue.filter((row) => row.queueStatus === 'waiting').length
    const avgWait = avg(centreQueue.filter((row) => row.queueStatus === 'waiting').map((row) => Number(row.estimatedWaitMinutes || 0)))
    return {
      centre: centre.name,
      utilization: centre.capacity ? Math.round((Math.min(Number(centre.capacity || 0), centreQueue.length) / Number(centre.capacity || 1)) * 100) : 0,
      throughput: tokens.filter((row) => row.centre_id === centre.id && row.queue_status === 'completed').length,
      wait: Number(avgWait.toFixed(1)),
      congestion: waiting,
    }
  })

  const recommendedSlots = Object.entries(profiles.hourAvg)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)
    .map(([hourLabel], index) => ({
      centre: centres[index % Math.max(centres.length, 1)]?.name || 'QueueKisan Centre',
      date: new Date().toISOString().slice(0, 10),
      time: hourLabel,
      expectedLoad: profiles.congestionScore > 55 ? 'Moderate' : 'Low',
    }))

  const predictionDescription = mlDiagnostics?.model && mlDiagnostics.model !== 'historical-heuristic'
    ? 'Hybrid ML predictor using KMeans queue-load clustering and RandomForest regression over historical lifecycle data when available.'
    : 'Historical heuristic fallback based on centre, crop, hour-window, and quantity patterns.'

  return {
    analyticsData: {
      farmerRegistrations: {
        labels: [...new Set(farmers.map((row) => row.registered_date).filter(Boolean))].sort().slice(-7),
        data: [...new Set(farmers.map((row) => row.registered_date).filter(Boolean))].sort().slice(-7).map((day) => farmers.filter((row) => row.registered_date === day).length),
      },
      villageDistribution: {
        labels: Object.keys(villageCounts).slice(0, 8),
        data: Object.values(villageCounts).slice(0, 8),
      },
      dailyProcurements: {
        labels: dates,
        data: dates.map((day) => procurements.filter((row) => row.date === day).length),
      },
      cropDistribution: {
        labels: Object.keys(cropCounts),
        data: Object.values(cropCounts),
      },
      avgWaitTimes: {
        labels: centrePerformance.map((row) => row.centre),
        data: centrePerformance.map((row) => row.wait),
      },
      centrePerformance: {
        labels: centrePerformance.map((row) => row.centre),
        utilization: centrePerformance.map((row) => row.utilization),
        throughput: centrePerformance.map((row) => row.throughput),
      },
    },
    predictions: {
      expectedCrowdLevel: { value: profiles.congestionLevel, confidence: mlDiagnostics?.model && mlDiagnostics.model !== 'historical-heuristic' ? 'ML-backed' : 'Historical', description: 'Calculated from live waiting load, historical centre throughput, and learned queue-load clusters.' },
      estimatedWaitTime: { value: `${Math.round(avg(queue.filter((row) => row.queueStatus === 'waiting').map((row) => Number(row.estimatedWaitMinutes || 0))) || 0)} min`, confidence: mlDiagnostics?.regressionSamples ? `${mlDiagnostics.regressionSamples} labeled runs` : 'Historical baseline', description: predictionDescription },
      peakHourPrediction: { value: profiles.peakHour, confidence: mlDiagnostics?.clusterSamples ? `${mlDiagnostics.clusterSamples} hourly samples` : 'Historical counts', description: 'Derived from historical queue volume concentration by slot hour and ML congestion grouping when available.' },
      noShowPatterns: { value: `${tokens.filter((row) => row.queue_status === 'no-show').length} tokens`, confidence: 'Recorded history', description: 'Based on historical queue outcomes recorded in Supabase.' },
      recommendedSlots,
      averageProcessingTime: `${Math.round(profiles.globalAvgServiceMinutes)} min`,
      congestionScore: profiles.congestionScore,
    },
    mlDiagnostics: {
      ...mlDiagnostics,
      recordedLifecycleSamples: profiles.recordedLifecycleSamples,
      totalCompletedSamples: profiles.totalCompletedSamples,
    },
  }
}
