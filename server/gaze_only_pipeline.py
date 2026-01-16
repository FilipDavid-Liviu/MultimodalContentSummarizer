import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split, StratifiedKFold, RandomizedSearchCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score


def run_gaze_only_pipeline():
    print("\n" + "=" * 60)
    print("TRAINING BASELINE: GAZE FEATURES ONLY")
    print("=" * 60)

    # 1. LOAD & MERGE (Same logic as pipeline.py)
    ecg = pd.read_csv('ECG_FeaturesExtracted.csv')
    eye = pd.read_csv('EyeTracking_FeaturesExtracted.csv')
    data = pd.concat([eye, ecg.drop('Quad_Cat', axis=1)], axis=1)

    # 2. LABEL MAPPING
    mapping = {0: 4, 1: 3, 2: 1, 3: 2}
    data['target_state'] = data['Quad_Cat'].map(mapping)

    # 3. FEATURE SELECTION (Gaze Only)
    gaze_features = ['Mean_Fixation_Duration', 'Num_of_Fixations', 'Mean_Saccade_Duration']
    X = data[gaze_features].fillna(0)
    y = data['target_state']

    # 4. SPLIT
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # 5. TUNING
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    param_dist = {
        'n_estimators': [300, 600, 1000],
        'max_depth': [None, 10, 20],
        'class_weight': ['balanced'],
    }

    search = RandomizedSearchCV(
        estimator=RandomForestClassifier(random_state=42, n_jobs=-1),
        param_distributions=param_dist,
        n_iter=15,
        cv=cv,
        scoring='accuracy',
        n_jobs=-1,
        random_state=42
    )

    search.fit(X_train, y_train)
    best_model = search.best_estimator_

    # 6. SAVE
    joblib.dump(best_model, 'gaze_only_model.pkl')
    print(f"Gaze-Only Accuracy: {accuracy_score(y_test, best_model.predict(X_test)):.4f}")

if __name__ == "__main__":
    run_gaze_only_pipeline()
