from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
import joblib
import numpy as np

# ===============================
# Load models & encoders
# ===============================
gbc_best = joblib.load("gbc_best.pkl")
xgb_best = joblib.load("xgb_best.pkl")
gbr_best = joblib.load("gbr_best.pkl")
xgbr_best = joblib.load("xgbr_best.pkl")
le_status = joblib.load("label_encoder.pkl")

# ===============================
# Define FastAPI app
# ===============================
app = FastAPI(
    title="Device Failure Prediction API",
    description="API for predicting device failure class and time-to-failure",
    version="1.0.0"
)

# ===============================
# Define request schema
# ===============================
class PredictRequest(BaseModel):
    RuntimeHours: float
    TemperatureC: float
    PressureKPa: float
    VibrationMM_S: float
    PerformanceScore: float
    CurrentDrawA: float
    SignalNoiseLevel: float
    HealthIndex: float
    StressFactor: float
    StabilityRatio: float
    EnergyEfficiency: float

# ===============================
# Define prediction endpoint
# ===============================
@app.post("/predict")
def predict(request: PredictRequest):
    data = request.dict()
    df = pd.DataFrame([data])

    # Add required smoothed features (same names as in training)
    df["TemperatureC_smooth"] = df["TemperatureC"]
    df["PressureKPa_smooth"] = df["PressureKPa"]
    df["VibrationMM_S_smooth"] = df["VibrationMM_S"]
    df["CurrentDrawA_smooth"] = df["CurrentDrawA"]
    df["SignalNoiseLevel_smooth"] = df["SignalNoiseLevel"]

    # Classification
    gbc_probs = gbc_best.predict_proba(df)
    gbc_preds = np.argmax(gbc_probs, axis=1)

    xgb_probs = xgb_best.predict_proba(df)
    xgb_preds = np.argmax(xgb_probs, axis=1)

    final_class = np.round((gbc_preds + xgb_preds) / 2).astype(int)
    class_label = le_status.inverse_transform(final_class)[0]

    # Regression
    gbr_pred = gbr_best.predict(df)
    xgbr_pred = xgbr_best.predict(df)
    final_time = float((gbr_pred + xgbr_pred) / 2)

    return {
        "Predicted_Class": class_label,
        "Predicted_TimeToFailure": final_time
    }

# ===============================
# Root endpoint (for testing)
# ===============================
@app.get("/")
def read_root():
    return {"message": "Device Failure Prediction API is running"}
