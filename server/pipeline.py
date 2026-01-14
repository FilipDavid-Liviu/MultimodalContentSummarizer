import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score


def run_training_pipeline():
    # 1. LOAD DATA
    ecg = pd.read_csv('ECG_FeaturesExtracted.csv')
    eye = pd.read_csv('EyeTracking_FeaturesExtracted.csv')
    gsr = pd.read_csv('GSR_FeaturesExtracted.csv')

    # 2. MERGE FEATURES (Files are row-aligned)
    # Dropping Quad_Cat from others to avoid duplicates
    data = pd.concat([eye, ecg.drop('Quad_Cat', axis=1), gsr.drop('Quad_Cat', axis=1)], axis=1)

    # 3. LABEL MAPPING (VREED to Project Labels)
    # 0->4 (Sleepy), 1->3 (Frustrated), 2->1 (Interest), 3->2 (Confusion)
    mapping = {0: 4, 1: 3, 2: 1, 3: 2}
    data['target_state'] = data['Quad_Cat'].map(mapping)

    # 4. FEATURE SELECTION (Matching your ProjectCAbpm.docx requirements)
    # We select key features like MFD, BPM, and Saccades
    features = [
        'Mean_Fixation_Duration', 'Num_of_Fixations', 'Mean_Saccade_Duration',
        'Bpm', 'Sdnn', 'Rmssd',  # Heart Rate variability features
        'Mean', 'SD', 'Ratio'  # GSR features for stress
    ]

    X = data[features].fillna(0)
    y = data['target_state']

    # 5. TRAIN/TEST SPLIT
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # 6. TRAIN RANDOM FOREST
    print("Training Random Forest Classifier...")
    model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
    model.fit(X_train, y_train)

    # 7. EVALUATE
    y_pred = model.predict(X_test)
    print(f"Model Accuracy: {accuracy_score(y_test, y_pred):.2f}")
    print("\nClassification Report:\n", classification_report(y_test, y_pred))

    # 8. SAVE FOR FASTAPI SERVER
    joblib.dump(model, 'gaze_rf_model.pkl')
    joblib.dump(features, 'feature_list.pkl')  # Save feature names for the server
    print("Model saved as 'gaze_rf_model.pkl'")


if __name__ == "__main__":
    run_training_pipeline()
