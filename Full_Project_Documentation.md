
# Predicting Medical Equipment Failure — Detailed Documentation (For Report)

> Use this content to replace the report sections after the first three pages (Opening / Gratitude / Acknowledgement).
> Paste sections directly into your project report (word / LaTeX / Google Docs).

---
## Table of Contents (to include in the report)
1. Abstract
2. Introduction
3. Project Goals & Scope
4. Dataset Description
5. Data Conditioning & Enrichment
6. Feature Engineering (Derivations)
7. Model Selection & Training Procedure
8. Evaluation Metrics & Results
9. Ensemble Strategy & Final Models
10. Streaming & Deployment Architecture
11. Backend Implementation (predict_server.py)
12. Frontend Implementation (index.html, app.js, style.css)
13. False-Alarm Mitigation & Post-processing
14. Reproducibility & Run Instructions
15. Project Limitations & Ethical Considerations
16. Future Work
17. References
18. Appendices (file list, model spec, sample outputs)

---
## Abstract
This project builds an end-to-end predictive maintenance system for medical devices that:
1. Classifies device health status (Working, WillFail, Failed).
2. Estimates remaining useful life (RUL) as a time-to-failure regression.

We used a 150,000-row telemetry dataset (`mlbuild.csv`), performed schema-preserving conditioning, derived additional features, trained multiple models (Logistic Regression, Random Forest, Gradient Boosting, XGBoost) and ensemble combinations, and deployed the models behind a FastAPI service with a real-time web dashboard. The goal is to provide hospital operators with explainable, low‑false‑alarm warnings that enable proactive maintenance and improve patient safety.

---
## Introduction
Predictive maintenance for critical medical devices reduces unplanned downtime and supports patient safety. Unlike scheduled maintenance, predictive approaches anticipate failures using sensor telemetry and operational metrics. Our prototype demonstrates how to build a full-stack system — data preprocessing, model development and benchmarking, streaming inference, and a dashboard — that could be extended to production in hospitals or clinics.

---
## Project Goals & Scope
**Primary goals:**
- Achieve robust classification of device state (Working / WillFail / Failed).
- Produce meaningful RUL estimates (time-to-failure) for planning maintenance.
- Minimize false alarms while preserving early detection sensitivity.
- Build a streaming-friendly pipeline that demonstrates near-real-time inference.
- Package code and documentation so judges or reviewers can reproduce and run the demo.

**Constraints kept during the hackathon:**
- Do not change the dataset schema (i.e., column names and semantics remain intact).
- Improve dataset quality via conditioning, enrichment, and smoothing only (derived features allowed).
- Produce reproducible artifacts (`.pkl` model files, notebooks, and a web frontend).

---
## Dataset Description
**Source:** `mlbuild.csv` (provided/hypothetical hackathon dataset)
**Rows:** ~150,000
**Core columns (original schema):**
- DeviceType, DeviceName
- RuntimeHours
- TemperatureC, PressureKPa, VibrationMM_S
- PerformanceScore, CurrentDrawA, SignalNoiseLevel
- PredictedStatus, FailureRisk, PredictedTimeToFailure

**Observations:**
- `FailureRisk` was redundant with `PredictedStatus` (mapped Low/Medium/High ↔ Working/WillFail/Failed).
- `PredictedTimeToFailure` is RUL-like, with zeros for Failed records.
- No device_id or reliable timestamps initially → synthetically assigned DeviceID to simulate device history.

**Enhancements made (schema-preserving):**
- Applied bounds/clipping for each sensor to realistic ranges.
- Enforced status ↔ RUL consistency (Failed → RUL=0, ranges for WillFail/Working).
- Winsorized extreme outliers (0.5% / 99.5% by default).
- Added derived features (not permanently altering original fields unless saved as new file):
  - HealthIndex, StressFactor, StabilityRatio, EnergyEfficiency.
- Generated synthetic `DeviceID` and applied per-device smoothing to create `*_smooth` columns for streaming realism.

---
## Data Conditioning & Enrichment (detailed)
1. **Bounds enforcement:** clip each numeric column to realistic lower/upper limits. Example: TemperatureC ∈ [0, 120], VibrationMM_S ∈ [0, 20].
2. **Label consistency rules:** 
   - If `PredictedStatus == "Failed"` then set `PredictedTimeToFailure = 0`.
   - If `PredictedStatus == "Working"` ensure RUL ≥ 100 (domain heuristics).
   - If `PredictedStatus == "WillFail"` clip RUL to (0, 100).
3. **Outlier handling:** winsorize columns at quantiles to remove extreme spikes that are non-physical.
4. **Smoothing:** when `DeviceID` exists, apply a group-wise rolling median (window=3) to temperature, vibration, current, noise to remove per-record jitter while preserving trends.
5. **Synthetic DeviceID:** distributed rows across N device ids by device type to simulate longitudinal device streams for GroupKFold validation and streaming demos.

Rationale: these steps preserve the original column names and semantics while making the data physically plausible and more useful for learning temporal degradation patterns (in a simulated way).

---
## Feature Engineering (Derivations)
The derived features used in modeling are simple, explainable ratios and interactions that highlight stress or declining performance.

- **HealthIndex** = PerformanceScore / (RuntimeHours + 1)  
  Interprets remaining performance-per-hour; falling values indicate degradation.

- **StressFactor** = (TemperatureC * PressureKPa) / 1000  
  Represents environmental stress; higher values indicate harsher operating conditions.

- **StabilityRatio** = SignalNoiseLevel / (VibrationMM_S + 1e-3)  
  Measures the relative noise to motion — higher means noisier signals for a given vibration level.

- **EnergyEfficiency** = PerformanceScore / (CurrentDrawA + 1e-3)  
  Shows output per unit current; falling values indicate efficiency loss or drift.

Also included: smoothed versions of raw sensors (e.g., `TemperatureC_smooth`) for use in streaming inference.

---
## Model Selection & Training Procedure (detailed)
**Models tested (classification):** LogisticRegression, RandomForestClassifier, GradientBoostingClassifier (sklearn), XGBClassifier.  
**Models tested (regression):** LinearRegression, RandomForestRegressor, GradientBoostingRegressor, XGBRegressor.

**Training notes:**
- Preprocessing uses `ColumnTransformer` to impute missing values, standardize numeric features, and one-hot encode categorical fields (DeviceType/DeviceName if used).
- Encoded target for classification (`FailureRisk`) with LabelEncoder to map strings to integers for model training.
- Cross-validation: **GroupKFold** by `DeviceID` to prevent leakage (no history of the same device in train & validation).
- Train/test split: time-aware holdout or GroupKFold; for quick benchmarks we used 50/50 with stratify on labels in some runs (but GroupKFold is recommended).
- Hyperparameter tuning: grid search / manual tuning for n_estimators, max_depth, learning_rate, subsample, colsample_bytree for tree-based models; classical solvers and scaling for logistic regression.

**Implementation detail (sklearn + xgboost flow):**
- Pipeline: `preprocessor` (imputer + scaler + encoder) → `XGBClassifier` with `n_estimators=50, learning_rate=0.05, max_depth=3` (example baseline).
- Saved trained pipelines with `joblib.dump(...)` to `*.pkl` files for deployment.

**Why these models?**
- **Tree-based models (RandomForest, GradientBoosting, XGBoost)** are robust to feature scaling, capture non-linear relationships, and handle mixed data types well — ideal for telemetry sensors and RUL prediction.
- **XGBoost** provides efficient gradient boosting with regularization and is commonly strong in tabular tasks.
- **GradientBoosting (sklearn)** provided the best single-model classification accuracy in our experiments (77.7%), and best regressor MAE ~110, RMSE ~161 for RUL prediction.
- **Ensembling** is a standard industry technique to reduce variance and improve generalization by averaging different model inductive biases.

---
## Evaluation Metrics & Results (detailed)
**Classification (FailureRisk / PredictedStatus)**  
Metrics reported: Accuracy, Precision, Recall, F1-Score. Confusion matrix used for per-class analysis to identify false alarms (Working predicted as Failed) or missed degradations (WillFail predicted as Working).

Summary of benchmark results (representative run):
- Logistic Regression: **Accuracy ~ 0.6506**
  - Pros: fast baseline, interpretable coefficients
  - Cons: poor performance on non-linear sensor interactions

- Random Forest: **Accuracy ~ 0.7346**
  - Pros: good recall on “Failed” class; robust
  - Cons: less calibrated probabilities

- XGBoost: **Accuracy ~ 0.7376**
  - Pros: strong gradient boosting performance
  - Cons: sensitive to hyperparams

- Gradient Boosting (sklearn): **Accuracy ~ 0.7769** — *Best single-model classifier*
  - Pros: best single-model accuracy in our runs; good recall on Failed and WillFail in tuned settings

**Ensemble classifier (quick averaging of GB + XGB):** **Accuracy ~ 0.7452** (slightly lower in one quick ensemble variant; ensemble tuning may improve further).

**Regression (PredictedTimeToFailure)**  
Metrics: MAE (Mean Absolute Error) and RMSE (Root Mean Squared Error)

Representative results:
- Linear Regression: MAE ~ 131.46, RMSE ~ 183.94
- RandomForestRegressor: MAE ~ 114.52, RMSE ~ 173.36
- XGBoostRegressor: MAE ~ 113.47, RMSE ~ 171.68
- GradientBoostingRegressor: **MAE ~ 110.46, RMSE ~ 161.59** — *Best regressor in baseline*
- Ensemble Regressor (averaging): MAE ~ 111.18, RMSE ~ 167.38

**Interpretation:**
- Classification scores are below the desired 90% threshold; however, model improvements using additional feature engineering, better hyperparameter tuning (Optuna), and stacking/ensembling could push values higher.
- RUL MAE ~110 units indicates the scale of prediction error; if RuntimeHours is measured in hours, this implies rough windows — useful for planning but not minute-accurate predictions without domain-specific tuning.

---
## Model Selection Rationale
We selected **GradientBoostingClassifier** (single best) and **GradientBoostingRegressor** due to consistent best performance in our experiments and stable behavior when deployed in scikit-learn pipelines. XGBoost was used in ensemble experiments for diversity and to test performance gains from different boosting implementations.

**Why not deep learning?** For this tabular dataset with engineered features and limited temporal history, gradient-boosted trees typically outperform deep nets in both accuracy and training efficiency — especially for small-to-moderate data sizes and where interpretability is important for domain experts.

---
## Ensemble Strategy & Final Models
- **Quick ensemble approach (fast):** average predicted probabilities from pre-trained GB and XGB classifiers, take majority/rounded result → fast to compute for the demo.
- **Ensemble wrapper:** a small Python class wraps the averaging/stacking logic and is serialized with `joblib.dump()` so the deployment loads a single object that internally calls members and returns final predictions.
- **Final artifacts:** saved `.pkl` models:
  - `gbc_best.pkl` — Gradient Boosting Classifier (best single model)
  - `gbr_best.pkl` — Gradient Boosting Regressor (best single regressor)
  - `xgb_best.pkl`, `xgbr_best.pkl` — XGBoost models used in ensembles
  - `ensemble_classifier.pkl`, `ensemble_regressor.pkl` — quick ensemble wrappers

---
## Streaming & Deployment Architecture
**High-level design**:
1. **Data Source (simulated):** `mlbuild_cleaned_with_ids.csv` rows are emitted as events to simulate device telemetry stream.
2. **FastAPI Service (`predict_server.py`):** receives record(s), applies the preprocessing and model pipeline, and returns JSON predictions.
3. **Streaming Endpoint:** SSE (Server-Sent Events) implemented for live updates to the frontend; fallback to polling if SSE not supported.
4. **Frontend Dashboard (`index.html`, `app.js`, `style.css`):** subscribes to the SSE stream and updates device cards and charts live; includes manual prediction form for single-record testing.
5. **Model artifacts:** residing on the server, loaded once into memory to keep latency low.

**Why FastAPI?** FastAPI provides fast synchronous/asynchronous routes, built-in docs, and easy json serialization — great for demoing a prediction microservice with low overhead.

---
## Backend Implementation — `predict_server.py` (explain in words)
- **Load models**: uses `joblib.load()` to load the saved model artifacts into global variables so they persist in memory across calls.
- **Define request schema**: a Pydantic `BaseModel` describes the input fields expected by `/predict` (same as the preprocessor features).
- **/predict endpoint**:
  1. Validate and parse the input JSON into a pandas DataFrame with one row.
  2. Add required smoothed features (if the incoming row lacks them) or replicate names used during training (e.g., `TemperatureC_smooth`).
  3. Run classifier(s) to get probabilities and predicted class(es); ensemble by averaging or majority rule.
  4. Run regressor(s) and average outputs to get final RUL estimate.
  5. Return JSON: `{"Predicted_Class": ..., "Predicted_TimeToFailure": ...}`.
- **Root endpoint** for health check returns a simple JSON message.
- **CORS**: enable during deployment for frontend hosted on different origin (not included by default in minimal examples — add `fastapi.middleware.cors` if needed).

Reference: the actual implementation file is included in the project package and demonstrates the above behavior.

---
## Frontend Implementation — (describe files)
**`index.html`** — Provides layout for dashboard, manual prediction form, stats cards, device grid, and canvas for Chart.js charts.
**`style.css`** — Visual theme, color tokens, light/dark mode, responsive styles, and card/states visuals.
**`app.js`** — Application logic:
- Connects to SSE `/stream` endpoint for live updates; if unavailable, falls back to a local simulation loop that reads rows and feeds them into the UI.
- Renders device cards and charts using Chart.js.
- Posts manual prediction requests to `/predict` endpoint and displays returned results.
- Integrates client-side postprocessing to reduce false alarms: EMA smoothing of numeric values, majority voting buffer (N last predictions), dwell-time logic requiring K consecutive changes before flipping status, and cooldown timers to avoid flapping.

These client-side heuristics preserve UI stability without changing backend models.

---
## False-Alarm Mitigation & Post-processing
To reduce both 'panic' and missed-detection cases we implemented:
1. **Rule-based consistency** in dataset (status ↔ RUL mapping).
2. **Group-wise smoothing** of sensor readings to remove single-record spikes.
3. **Client-side postprocessing**: EMA smoothing, majority-buffer voting, dwell-time (require K same predicted classes before switching), and a cooldown period timer to prevent rapid flips.
4. **Threshold hysteresis** for PTTF bands (different thresholds to enter/exit warning states), producing robust state transitions in UI.

Explanation: A combination of data conditioning and client-side smoothing is ideal for demo stage: backend models remain simple & explainable, UI behaves stably, and alerts are credible for human operators.

---
## Reproducibility & Run Instructions (summary)
1. Install Python deps:
   ```bash
   pip install pandas numpy scikit-learn xgboost joblib fastapi uvicorn reportlab
   ```
2. Ensure model `.pkl` files are in the project folder with `predict_server.py` and frontend files.
3. Start the API server:
   ```bash
   uvicorn predict_server:app --reload --port 8000
   ```
   The server will be available at `http://127.0.0.1:8000`.
4. Open `index.html` in your browser (or host via simple HTTP server):
   ```bash
   python -m http.server 8080
   # then open http://localhost:8080/index.html
   ```
5. For the streaming demo, `predict_server.py` provides `/stream` SSE endpoint and `/predict` POST endpoint.
6. To re-train models, use the provided training notebooks/scripts and save artifacts with `joblib.dump()`.

Exact code files and runnable scripts are included in the project package `med_failure_project_package.zip` in the project root.

---
## Project Limitations & Ethical Considerations
- **Domain realism:** mlbuild.csv is synthetic/curated. Real hospital devices produce more complex logs, richer metadata, and safety constraints.
- **Label provenance:** If labels are derived from prior models, the system may propagate biases; prefer ground-truth failure logs where possible.
- **Safety:** Predictions that affect patient care require rigorous validation, regulatory approvals, and human-in-the-loop safety checks before deployment.
- **Privacy:** Medical device metadata and patient-linked data should be handled per HIPAA/GDPR constraints — avoid storing patient-identifiable information in telemetry streams without consent and proper controls.

---
## Future Work & Recommendations
- Integrate real device timestamps and unique identifiers to enable true temporal models and sequence learning (LSTM/Transformer or TCN architectures).
- Build a feature store for online/offline parity and persistent rolling features.
- Use AutoML/Optuna for hyperparameter optimization and stacking ensembles.
- Add explainability (SHAP) to provide feature-level explanations for operators.
- Deploy with Kubernetes + Docker for scalable, robust production deployment and monitoring.

---
## References
- Scikit-learn documentation — https://scikit-learn.org
- XGBoost documentation — https://xgboost.readthedocs.io
- FastAPI documentation — https://fastapi.tiangolo.com
- Industry resources on predictive maintenance, CMMS, and medical device regulation.

---
## Appendices
- Appendix A: File list (included in package)
  - `index.html`, `style.css`, `app.js`, `predict_server.py`
  - Model artifacts: `gbc_best.pkl`, `gbr_best.pkl`, `xgb_best.pkl`, `xgbr_best.pkl`, `label_encoder.pkl`
  - Notebooks & preprocessing scripts used to generate cleaned/enriched datasets
  - `Medical_Device_Failure_Prediction_Report.pdf` (auto-generated shorter report)
  - `Full_Project_Documentation.md` (this file)
- Appendix B: Sample output JSON from `/predict`
  ```json
  {
    "Predicted_Class": "Working",
    "Predicted_TimeToFailure": 680.45
  }
  ```
- Appendix C: Quick checklist for the demo
  - Start API server (uvicorn)
  - Start simple HTTP server to serve frontend, or open index.html directly
  - Ensure model files present
  - Show the streaming demo (SSE) and manual predict form
