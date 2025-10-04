# MedPredict AI - Medical Equipment Failure Prediction System

## Overview

MedPredict AI is a comprehensive cloud-based predictive maintenance solution for critical medical devices. The system leverages real-time IoT telemetry, advanced machine learning models, and modern web technologies to predict equipment failures before they occur, enabling proactive maintenance and improving hospital operational reliability.

## 🏥 Problem Statement

Healthcare facilities rely heavily on critical medical equipment such as ventilators, defibrillators, infusion pumps, and imaging devices. Unexpected equipment failures can:
- Compromise patient safety and care quality
- Lead to significant financial losses from downtime
- Cause operational disruptions in critical care environments
- Result in expensive emergency repairs and replacements

Traditional reactive maintenance approaches are insufficient for critical healthcare environments where equipment reliability is paramount.

## 🎯 Solution

Our AI-powered predictive maintenance platform provides:
- **Real-time monitoring** of medical device health through IoT telemetry
- **Early failure prediction** using advanced machine learning models
- **Proactive maintenance alerts** to prevent unexpected downtime
- **Historical analytics** for long-term equipment management
- **Secure, compliant data storage** for healthcare environments

## 🏗️ System Architecture

### Core Components

1. **IoT Telemetry Layer**
   - Device sensors collect temperature, vibration, runtime, and error metrics
   - MQTT protocol for lightweight, real-time data transmission
   - HiveMQ broker for scalable message routing

2. **Data Processing Pipeline**
   - Python-based streaming service (`stream_pipeline.py`)
   - Real-time data preprocessing and feature engineering
   - Multi-tier prediction logic with fallback mechanisms

3. **Machine Learning Engine**
   - Primary: Azure ML Studio endpoints for scalable inference
   - Fallback: Local XGBoost models for offline operation
   - Rule-based engine for threshold-based alerts

4. **Cloud Infrastructure**
   - **Azure ML Studio**: Model deployment and inference
   - **Azure Blob Storage**: Secure data archival and compliance
   - **Azure Functions**: Serverless event orchestration
   - **HiveMQ Cloud**: MQTT broker services

5. **Frontend Dashboard**
   - React + TypeScript application with Vite build system
   - Tailwind CSS for responsive design
   - Real-time device status visualization
   - Risk assessment and alert management

## 🔧 Technology Stack

### Backend
- **Language**: Python 3.8+
- **ML Framework**: XGBoost, scikit-learn
- **API Framework**: FastAPI
- **IoT Communication**: Paho-MQTT, HiveMQ
- **Cloud SDKs**: Azure Python SDK

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: React Hooks

### Cloud Services
- **Azure Machine Learning Studio**
- **Azure Blob Storage**
- **Azure Functions**
- **HiveMQ Cloud MQTT Broker**

### Data Pipeline
- **Message Protocol**: MQTT
- **Data Format**: JSON
- **Storage**: Azure Blob (JSON documents)
- **Processing**: Real-time streaming

## 📊 Machine Learning Pipeline

### Data Processing
1. **Feature Engineering**: Temperature, vibration, runtime, error counts
2. **Data Cleaning**: Missing value imputation, outlier handling
3. **Preprocessing**: StandardScaler for numerical features, OneHotEncoder for categorical
4. **Augmentation**: Gaussian noise addition for model robustness

### Model Development
- **Baseline**: Logistic Regression (underfitted)
- **Intermediate**: Random Forest (overfitted)
- **Final Model**: XGBoost Classifier
  - 40 estimators, learning rate 0.05
  - Max depth 3, L2 regularization
  - 85% accuracy, balanced F1 score

### Prediction Classes
- **Low Risk**: Normal operation, routine maintenance
- **Medium Risk**: Increased monitoring, scheduled maintenance
- **High Risk**: Immediate attention required, potential failure

## 🚀 Key Features

### Real-time Monitoring
- Live telemetry from 24+ medical devices
- Device status dashboard with color-coded risk levels
- Automatic refresh and real-time updates

### Predictive Analytics
- AI-driven failure risk assessment
- Confidence scoring for predictions
- Historical trend analysis

### Proactive Alerts
- Early warning system for equipment degradation
- Maintenance scheduling recommendations
- Risk escalation notifications

### Compliance & Security
- HIPAA-compliant data handling
- End-to-end encryption (TLS/HTTPS)
- Secure cloud storage with access controls
- Audit trail and data retention policies

## 📈 System Benefits

### For Healthcare Providers
- **Reduced Downtime**: Proactive maintenance prevents unexpected failures
- **Cost Savings**: Optimized maintenance schedules reduce operational costs
- **Patient Safety**: Improved equipment reliability enhances care quality
- **Compliance**: Automated documentation for regulatory requirements

### Technical Advantages
- **Scalability**: Cloud-native architecture supports growth
- **Reliability**: Multi-tier fallback ensures continuous operation
- **Flexibility**: Modular design enables easy feature additions
- **Security**: Enterprise-grade security and compliance features

## 🔄 Data Flow

1. **Device Telemetry** → MQTT → HiveMQ Broker
2. **HiveMQ** → Python Streaming Pipeline → Data Preprocessing
3. **Processed Data** → Azure ML Endpoint → Risk Prediction
4. **Prediction Results** → Azure Blob Storage → Historical Archive
5. **Real-time Data** → FastAPI → React Dashboard → User Interface

## 🛡️ Fault Tolerance

### Multi-tier Prediction Logic
1. **Primary**: Azure ML Studio cloud inference
2. **Secondary**: Local XGBoost model fallback
3. **Tertiary**: Rule-based threshold system

### Error Handling
- Exponential backoff retry mechanisms
- Comprehensive logging and monitoring
- Graceful degradation during service outages
- Connection pooling and circuit breakers

## 📱 Dashboard Features

### Device Overview
- Total device count and risk distribution
- Real-time status indicators
- Last update timestamps

### Device Details
- Individual device health metrics
- AI confidence scores
- Prediction explanations
- Historical performance data

### Analytics
- Risk trend visualization
- Maintenance scheduling
- Performance metrics
- Compliance reporting

## 🔧 Installation & Setup

### Prerequisites
- Python 3.8+
- Node.js 16+
- Azure account with ML Studio access
- HiveMQ Cloud account

### Backend Setup
```bash
# Clone repository
git clone <repository-url>
cd medical-device-prediction

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Update .env with your Azure and HiveMQ credentials

# Run streaming pipeline
python stream_pipeline.py
```

### Frontend Setup
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### Cloud Configuration
1. Deploy ML model to Azure ML Studio
2. Configure Azure Blob Storage container
3. Set up HiveMQ MQTT broker
4. Update connection strings in configuration

## 🚀 Deployment

### Local Development
- Python backend with FastAPI
- React frontend with Vite dev server
- Local ML model fallback

### Production Deployment
- Azure App Service for backend
- Static web hosting for frontend
- Azure ML Studio for inference
- Azure Blob Storage for data persistence

## 📊 Monitoring & Observability

### Metrics
- Device connection status
- Prediction accuracy rates
- API response times
- Storage utilization

### Logging
- Structured logging with timestamps
- Error tracking and alerting
- Performance monitoring
- Security audit trails

## 🔒 Security & Compliance

### Data Protection
- Encryption at rest and in transit
- Role-based access control
- Data anonymization capabilities
- Secure API authentication

### Healthcare Compliance
- HIPAA compliance framework
- Data retention policies
- Audit logging
- Privacy protection measures

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit pull request with documentation

## 📄 License

This project is proprietary software developed for healthcare applications. All rights reserved.

## 👥 Team

- **Cloud Architecture**: Azure services integration and ML pipeline
- **Frontend Development**: React dashboard and user experience
- **Data Science**: ML model development and validation
- **DevOps**: Deployment and monitoring infrastructure

## 📞 Support

For technical support or questions:
- Create an issue in the repository
- Contact the development team
- Review documentation and API references

---

**MedPredict AI** - Revolutionizing healthcare equipment maintenance through intelligent prediction and proactive care.