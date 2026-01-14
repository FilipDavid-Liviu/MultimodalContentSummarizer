import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
import warnings
warnings.filterwarnings('ignore')


def run_training_pipeline():
    """
    Retrained Random Forest pipeline with only computable features.
    Features that can be derived from client-side data:
    - Eye tracking: Mean_Fixation_Duration, Num_of_Fixations, Mean_Saccade_Duration
    - Heart rate: Bpm (from Polar Verity Sense)
    
    Removed features (cannot be computed client-side):
    - Sdnn, Rmssd (require RR intervals, not available from Polar Verity Sense)
    - GSR features (require separate sensor hardware)
    """
    print("=" * 60)
    print("RANDOM FOREST TRAINING PIPELINE - COMPUTABLE FEATURES ONLY")
    print("=" * 60)
    
    # 1. LOAD DATA
    print("\n[1/7] Loading datasets...")
    ecg = pd.read_csv('ECG_FeaturesExtracted.csv')
    eye = pd.read_csv('EyeTracking_FeaturesExtracted.csv')
    gsr = pd.read_csv('GSR_FeaturesExtracted.csv')
    print(f"   - Eye tracking: {len(eye)} samples")
    print(f"   - ECG: {len(ecg)} samples")
    print(f"   - GSR: {len(gsr)} samples")

    # 2. MERGE FEATURES (Files are row-aligned)
    print("\n[2/7] Merging datasets...")
    data = pd.concat([eye, ecg.drop('Quad_Cat', axis=1), gsr.drop('Quad_Cat', axis=1)], axis=1)

    # 3. LABEL MAPPING (VREED to Project Labels)
    # 0->4 (Sleepy), 1->3 (Frustrated), 2->1 (Interest), 3->2 (Confusion)
    print("\n[3/7] Mapping labels...")
    mapping = {0: 4, 1: 3, 2: 1, 3: 2}
    data['target_state'] = data['Quad_Cat'].map(mapping)
    
    # Display label distribution
    label_counts = data['target_state'].value_counts().sort_index()
    label_names = {1: "Focused Interest", 2: "Confusion", 3: "Frustration", 4: "Sleepiness"}
    print("   Label distribution:")
    for label_id, count in label_counts.items():
        print(f"   - {label_id} ({label_names[label_id]}): {count} samples")

    # 4. FEATURE SELECTION - ONLY COMPUTABLE FEATURES
    print("\n[4/7] Selecting computable features...")
    # Only features that can be computed from client-side raw data
    computable_features = [
        'Mean_Fixation_Duration',  # From I-DT algorithm on gaze data
        'Num_of_Fixations',         # From I-DT algorithm on gaze data
        'Mean_Saccade_Duration',    # From I-DT algorithm on gaze data
        'Bpm'                       # From Polar Verity Sense (Web Bluetooth)
    ]
    
    # Verify features exist in dataset
    missing_features = [f for f in computable_features if f not in data.columns]
    if missing_features:
        raise ValueError(f"Missing features in dataset: {missing_features}")
    
    print(f"   Selected {len(computable_features)} computable features:")
    for feat in computable_features:
        print(f"   - {feat}")

    X = data[computable_features].fillna(0)
    y = data['target_state']
    
    # Check for any remaining NaN or inf values
    if X.isnull().any().any():
        print("   Warning: NaN values found, filling with 0")
        X = X.fillna(0)
    if np.isinf(X).any().any():
        print("   Warning: Inf values found, replacing with 0")
        X = X.replace([np.inf, -np.inf], 0)

    # 5. TRAIN/TEST SPLIT
    print("\n[5/7] Splitting data (80/20)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"   Training set: {len(X_train)} samples")
    print(f"   Test set: {len(X_test)} samples")

    # 6. HYPERPARAMETER TUNING
    print("\n[6/7] Performing hyperparameter tuning with GridSearchCV...")
    print("   This may take a few minutes...")
    
    # Define parameter grid for tuning
    param_grid = {
        'n_estimators': [50, 100, 200],
        'max_depth': [5, 10, 15, 20, None],
        'min_samples_split': [2, 5, 10],
        'min_samples_leaf': [1, 2, 4],
        'max_features': ['sqrt', 'log2', None]
    }
    
    # Base model
    base_rf = RandomForestClassifier(random_state=42, n_jobs=-1)
    
    # GridSearchCV with 5-fold cross-validation
    grid_search = GridSearchCV(
        estimator=base_rf,
        param_grid=param_grid,
        cv=5,
        scoring='accuracy',
        n_jobs=-1,
        verbose=1
    )
    
    grid_search.fit(X_train, y_train)
    
    # Get best model
    best_model = grid_search.best_estimator_
    best_params = grid_search.best_params_
    best_score = grid_search.best_score_
    
    print(f"\n   Best cross-validation accuracy: {best_score:.4f}")
    print("   Best hyperparameters:")
    for param, value in best_params.items():
        print(f"   - {param}: {value}")

    # 7. EVALUATE ON TEST SET
    print("\n[7/7] Evaluating on test set...")
    y_pred = best_model.predict(X_test)
    test_accuracy = accuracy_score(y_test, y_pred)
    
    print(f"\n   Test Set Accuracy: {test_accuracy:.4f}")
    print("\n   Classification Report:")
    print(classification_report(y_test, y_pred, 
                                target_names=[label_names[i] for i in sorted(label_names.keys())]))
    
    print("\n   Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(f"{cm}")
    
    # Feature importances
    print("\n   Feature Importances:")
    feature_importance = pd.DataFrame({
        'feature': computable_features,
        'importance': best_model.feature_importances_
    }).sort_values('importance', ascending=False)
    for _, row in feature_importance.iterrows():
        print(f"   - {row['feature']}: {row['importance']:.4f}")

    # 8. SAVE MODEL AND METADATA
    print("\n[8/8] Saving model and metadata...")
    joblib.dump(best_model, 'gaze_rf_model.pkl')
    joblib.dump(computable_features, 'feature_list.pkl')
    
    # Save training metadata
    metadata = {
        'features': computable_features,
        'best_params': best_params,
        'cv_score': float(best_score),
        'test_accuracy': float(test_accuracy),
        'n_samples_train': len(X_train),
        'n_samples_test': len(X_test),
        'label_mapping': label_names
    }
    joblib.dump(metadata, 'model_metadata.pkl')
    
    print("   ✓ Model saved as 'gaze_rf_model.pkl'")
    print("   ✓ Feature list saved as 'feature_list.pkl'")
    print("   ✓ Metadata saved as 'model_metadata.pkl'")
    
    print("\n" + "=" * 60)
    print("TRAINING COMPLETE!")
    print("=" * 60)
    print(f"\nFinal Model Performance:")
    print(f"  - Cross-validation accuracy: {best_score:.4f}")
    print(f"  - Test set accuracy: {test_accuracy:.4f}")
    print(f"  - Features used: {len(computable_features)}")
    print("\nNote: Additional features (RereadFrequency, EnvFixationRatio, ClickCount)")
    print("      will be computed from raw client data during feature extraction.")


if __name__ == "__main__":
    run_training_pipeline()
