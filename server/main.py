from fastapi import FastAPI
import joblib
import pandas as pd

app = FastAPI()

try:
    model = joblib.load('gaze_rf_model.pkl')
    features_needed = joblib.load('feature_list.pkl')
    STATE_LABELS = {1: "Focused Interest", 2: "Confusion", 3: "Frustration", 4: "Sleepiness"}
except Exception as e:
    print(f"CRITICAL: Could not load model files. Error: {e}")


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
    return {
        "expected_features": features_needed,
        "model_type": str(type(model)),
        "num_features": len(features_needed)
    }
