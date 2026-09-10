#!/usr/bin/env python3
import json
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


def read_input():
    raw = sys.stdin.read().strip()
    return json.loads(raw or '{}')


def safe_float(value, default=0.0):
    try:
        if value is None or value == '':
            return default
        return float(value)
    except Exception:
        return default


def safe_int(value, default=0):
    try:
        if value is None or value == '':
            return default
        return int(value)
    except Exception:
        return default


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def build_cluster_model(history_rows):
    if len(history_rows) < 3:
        return None, None
    df = pd.DataFrame(history_rows)
    feature_cols = [
        'bookings_count', 'completed_count', 'no_show_count', 'skipped_count',
        'checked_in_count', 'avg_quantity_kg', 'completion_rate', 'centre_capacity',
        'hour_of_day',
    ]
    X = df[feature_cols].fillna(0.0)
    cluster_count = min(3, len(df))
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('model', KMeans(n_clusters=cluster_count, random_state=42, n_init=10)),
    ])
    labels = pipeline.fit_predict(X)
    df['cluster'] = labels

    cluster_stats = {}
    for cluster_id, rows in df.groupby('cluster'):
        bookings = rows['bookings_count'].mean()
        completed = rows['completed_count'].mean()
        throughput = max(completed, 1.0)
        avg_qty = rows['avg_quantity_kg'].mean()
        cluster_stats[int(cluster_id)] = {
            'bookings_avg': round(float(bookings), 3),
            'completed_avg': round(float(completed), 3),
            'avg_quantity_kg': round(float(avg_qty), 3),
            'completion_rate': round(float(rows['completion_rate'].mean()), 3),
            'base_service_minutes': round(float(clamp(60.0 / throughput + avg_qty / 250.0, 4.0, 45.0)), 3),
        }

    cluster_rank = sorted(cluster_stats.items(), key=lambda item: (item[1]['bookings_avg'], item[1]['base_service_minutes']))
    load_labels = {}
    label_names = ['Low', 'Moderate', 'High']
    for idx, (cluster_id, _) in enumerate(cluster_rank):
        load_labels[int(cluster_id)] = label_names[min(idx, len(label_names) - 1)]

    return pipeline, {
        'stats': cluster_stats,
        'load_labels': load_labels,
        'samples': len(df),
    }


def build_regressor(training_rows):
    usable = [row for row in training_rows if safe_float(row.get('service_minutes'), -1) > 0]
    if len(usable) < 5:
        return None, {'samples': len(usable)}

    df = pd.DataFrame(usable)
    X = df[[
        'centre_id', 'crop', 'hour_of_day', 'quantity_kg', 'check_in_flag',
        'centre_active_load', 'hour_active_load', 'bookings_count', 'completion_rate',
    ]].copy()
    y = df['service_minutes'].astype(float)

    categorical = ['centre_id', 'crop']
    numeric = ['hour_of_day', 'quantity_kg', 'check_in_flag', 'centre_active_load', 'hour_active_load', 'bookings_count', 'completion_rate']

    pre = ColumnTransformer([
        ('cat', OneHotEncoder(handle_unknown='ignore'), categorical),
        ('num', 'passthrough', numeric),
    ])

    model = Pipeline([
        ('pre', pre),
        ('rf', RandomForestRegressor(n_estimators=120, random_state=42, min_samples_leaf=1)),
    ])
    model.fit(X, y)
    train_score = model.score(X, y)
    return model, {
        'samples': len(usable),
        'train_r2': round(float(train_score), 4),
    }


def predict_active(history_rows, training_rows, active_rows):
    cluster_model, cluster_meta = build_cluster_model(history_rows)
    regressor, reg_meta = build_regressor(training_rows)

    active_df = pd.DataFrame(active_rows or [])
    predictions = []
    if active_df.empty:
        return predictions, {
            'model': 'none',
            'cluster_samples': cluster_meta['samples'] if cluster_meta else 0,
            'regression_samples': reg_meta['samples'] if reg_meta else 0,
        }

    if cluster_model is not None:
        cluster_features = active_df[[
            'bookings_count', 'completed_count', 'no_show_count', 'skipped_count',
            'checked_in_count', 'avg_quantity_kg', 'completion_rate', 'centre_capacity',
            'hour_of_day',
        ]].fillna(0.0)
        cluster_ids = cluster_model.predict(cluster_features)
    else:
        cluster_ids = np.array([-1] * len(active_df))

    reg_predictions = None
    if regressor is not None:
        reg_X = active_df[[
            'centre_id', 'crop', 'hour_of_day', 'quantity_kg', 'check_in_flag',
            'centre_active_load', 'hour_active_load', 'bookings_count', 'completion_rate',
        ]].copy()
        reg_predictions = regressor.predict(reg_X)

    active_records = active_df.to_dict(orient='records')
    ordered = []
    for idx, row in enumerate(active_records):
        cluster_id = int(cluster_ids[idx]) if len(cluster_ids) > idx else -1
        cluster_stats = (cluster_meta or {}).get('stats', {}).get(cluster_id, {})
        load_label = (cluster_meta or {}).get('load_labels', {}).get(cluster_id, 'Moderate')
        cluster_service = safe_float(cluster_stats.get('base_service_minutes'), 10.0)
        regression_service = safe_float(reg_predictions[idx], cluster_service) if reg_predictions is not None else None
        if regression_service is not None:
            service_minutes = clamp(0.65 * regression_service + 0.35 * cluster_service, 4.0, 45.0)
            prediction_source = 'ml-hybrid'
        elif cluster_model is not None:
            service_minutes = clamp(cluster_service, 4.0, 45.0)
            prediction_source = 'ml-cluster'
        else:
            service_minutes = clamp(8.0 + safe_float(row.get('quantity_kg')) / 150.0, 4.0, 45.0)
            prediction_source = 'fallback'

        if safe_int(row.get('check_in_flag')) == 1:
            service_minutes = max(4.0, service_minutes - 0.5)
        else:
            service_minutes = min(45.0, service_minutes + 0.75)

        ordered.append({
            **row,
            'predicted_service_minutes': round(float(service_minutes), 2),
            'cluster_id': cluster_id,
            'load_cluster': load_label,
            'prediction_source': prediction_source,
        })

    cumulative = 0.0
    for row in ordered:
        if row.get('queue_status') == 'serving':
            row['farmers_ahead'] = 0
            row['estimated_wait_minutes'] = 0.0
            cumulative = row['predicted_service_minutes'] * 0.4
        elif row.get('queue_status') == 'waiting':
            row['estimated_wait_minutes'] = round(float(cumulative), 2)
            row['farmers_ahead'] = sum(1 for prev in ordered if prev.get('order_index', 0) < row.get('order_index', 0) and prev.get('queue_status') in ('waiting', 'serving'))
            cumulative += row['predicted_service_minutes']
        else:
            row['estimated_wait_minutes'] = 0.0
            row['farmers_ahead'] = 0

    diagnostics = {
        'model': 'hybrid_ml' if regressor is not None else ('cluster_ml' if cluster_model is not None else 'fallback'),
        'cluster_samples': cluster_meta['samples'] if cluster_meta else 0,
        'regression_samples': reg_meta['samples'] if reg_meta else 0,
        'train_r2': reg_meta.get('train_r2') if reg_meta else None,
        'clusters': cluster_meta.get('stats') if cluster_meta else {},
    }
    return ordered, diagnostics


def main():
    payload = read_input()
    history_rows = payload.get('history_rows', [])
    training_rows = payload.get('training_rows', [])
    active_rows = payload.get('active_rows', [])
    predictions, diagnostics = predict_active(history_rows, training_rows, active_rows)
    sys.stdout.write(json.dumps({
        'predictions': predictions,
        'diagnostics': diagnostics,
    }))


if __name__ == '__main__':
    main()
