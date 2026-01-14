from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
import os
from feature_extractor import extract_features_from_window

app = FastAPI()

# Enable CORS for client requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your client URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model and metadata
try:
    model = joblib.load('gaze_rf_model.pkl')
    features_needed = joblib.load('feature_list.pkl')
    STATE_LABELS = {1: "Focused Interest", 2: "Confusion", 3: "Frustration", 4: "Sleepiness"}
    
    # Load metadata if available
    if os.path.exists('model_metadata.pkl'):
        model_metadata = joblib.load('model_metadata.pkl')
    else:
        model_metadata = None
        print("Warning: model_metadata.pkl not found. Model may be from old training.")
except Exception as e:
    print(f"CRITICAL: Could not load model files. Error: {e}")
    model = None
    features_needed = []
    model_metadata = None


def prepare_features(input_dict: dict):
    """
    Helper to ensure input features match the model's expected
    names and order regardless of input casing.
    """
    # 1. Create a case-insensitive lookup map from the input
    # e.g., {"bpm": 70} -> {"BPM": 70}
    clean_input = {str(k).lower(): v for k, v in input_dict.items()}

    # 2. Reconstruct the feature set based on the exact names the model expects
    ordered_data = {}
    for feat in features_needed:
        # Check if the feature (lowered) exists in our input
        val = clean_input.get(feat.lower(), 0)
        ordered_data[feat] = val

    # 3. Create DataFrame with the explicit column order
    return pd.DataFrame([ordered_data])[features_needed]


@app.post("/debug/predict-emotion")
async def predict_emotion_only(features: dict):
    df = prepare_features(features)
    prediction = int(model.predict(df)[0])

    return {
        "status": "success",
        "state_id": prediction,
        "label": STATE_LABELS.get(prediction, "Unknown")
    }


@app.post("/debug/explain")
async def explain_prediction(features: dict):
    df = prepare_features(features)
    prediction = int(model.predict(df)[0])

    importances = model.feature_importances_
    contributions = {}
    for i, feat in enumerate(features_needed):
        val = float(df[feat].iloc[0])
        contributions[feat] = {
            "value": val,
            "impact_score": round(val * importances[i], 4)
        }

    sorted_drivers = sorted(contributions.items(), key=lambda x: x[1]['impact_score'], reverse=True)[:3]

    return {
        "prediction": STATE_LABELS.get(prediction),
        "top_drivers": sorted_drivers,
        "full_feature_breakdown": contributions
    }


@app.post("/analyze-window")
async def analyze_window(window_data: dict):
    """
    Main endpoint for analyzing window data from client.
    Receives raw gaze, interaction, and heart rate data.
    Extracts features and predicts affective state.
    """
    import logging
    logger = logging.getLogger("uvicorn")
    
    logger.info(f"Received window data: window_id={window_data.get('window_id')}, "
                f"gaze_points={len(window_data.get('gaze_log', []))}, "
                f"interactions={len(window_data.get('interactions', []))}, "
                f"heart_rate_samples={len(window_data.get('heart_rate', []))}")
    
    if model is None:
        logger.error("Model not loaded!")
        return {
            "status": "error",
            "error": "Model not loaded"
        }
    
    try:
        # Extract features from raw window data
        features = extract_features_from_window(window_data)
        logger.info(f"Extracted features: {features}")
        
        # Prepare features for model
        df = prepare_features(features)
        
        # Predict
        prediction = int(model.predict(df)[0])
        state_label = STATE_LABELS.get(prediction, "Unknown")
        
        logger.info(f"Prediction: {prediction} ({state_label})")
        
        # Determine if intervention is needed (Confusion=2, Frustration=3)
        intervention_needed = prediction in [2, 3]
        
        result = {
            "status": "success",
            "state_id": prediction,
            "state": state_label,
            "features": features,
            "intervention_needed": intervention_needed,
            "window_id": window_data.get("window_id", "unknown")
        }
        
        logger.info(f"Sending response: {result}")
        return result
    except Exception as e:
        logger.error(f"Error processing window: {str(e)}", exc_info=True)
        return {
            "status": "error",
            "error": str(e)
        }


@app.post("/summarize-flow")
async def summarize_flow(payload: dict):
    text = payload.get("text", "")
    features = payload.get("features", {})

    df = prepare_features(features)
    prediction = int(model.predict(df)[0])

    # Determine if intervention is needed (Confusion=2, Frustration=3)
    should_act = prediction in [2, 3]

    return {
        "state": STATE_LABELS.get(prediction),
        "intervention_triggered": should_act,
        "original_text": text,
        "note": "Gemini bypass active"
    }


@app.get("/debug/model-info")
async def model_info():
    """Get information about the loaded model"""
    info = {
        "expected_features": features_needed,
        "model_type": str(type(model)) if model else "Not loaded",
        "num_features": len(features_needed),
        "state_labels": STATE_LABELS
    }
    
    if model_metadata:
        info.update({
            "training_metadata": {
                "cv_accuracy": model_metadata.get('cv_score'),
                "test_accuracy": model_metadata.get('test_accuracy'),
                "best_params": model_metadata.get('best_params'),
                "n_train_samples": model_metadata.get('n_samples_train'),
                "n_test_samples": model_metadata.get('n_samples_test')
            }
        })
    
    return info