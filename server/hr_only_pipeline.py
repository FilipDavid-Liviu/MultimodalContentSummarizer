import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split, StratifiedKFold, RandomizedSearchCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix


def run_hr_only_pipeline():
    print("=" * 60)
    print("BASELINE: HEART RATE ONLY (NO GAZE FEATURES)")
    print("=" * 60)

    # 1. LOAD DATA
    ecg = pd.read_csv('ECG_FeaturesExtracted.csv')

    # 2. LABEL MAPPING (VREED to Project Labels)
    mapping = {0: 4, 1: 3, 2: 1, 3: 2}
    ecg['target_state'] = ecg['Quad_Cat'].map(mapping)
    label_names = {1: "Focused Interest", 2: "Confusion", 3: "Frustration", 4: "Sleepiness"}

    # 3. FEATURE SELECTION - Heart Rate Only
    # We use only 'Bpm' to isolate physiological arousal
    X = ecg[['Bpm']].fillna(0)
    y = ecg['target_state']

    # 4. TRAIN/TEST SPLIT (Keeping same 80/20 split and random_state for comparison)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # 5. HYPERPARAMETER TUNING (Same grid as your multimodal script)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    param_dist = {
        'n_estimators': [300, 600, 1000],
        'max_depth': [None, 10, 20, 30],
        'min_samples_split': [2, 5, 10],
        'min_samples_leaf': [1, 2, 4],
        'max_features': ['sqrt', None],
        'class_weight': ['balanced'],
    }

    search = RandomizedSearchCV(
        estimator=RandomForestClassifier(random_state=42, n_jobs=-1),
        param_distributions=param_dist,
        n_iter=20,
        cv=cv,
        scoring='accuracy',
        n_jobs=-1,
        random_state=42
    )

    search.fit(X_train, y_train)
    best_model = search.best_estimator_

    # 6. EVALUATION
    y_pred = best_model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)

    print(f"\nHR-Only Test Set Accuracy: {accuracy:.4f}")
    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # SAVE FOR COMPARISON
    joblib.dump(best_model, 'hr_only_model.pkl')
    return accuracy


if __name__ == "__main__":
    run_hr_only_pipeline()
