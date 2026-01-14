from sklearn.ensemble import RandomForestClassifier
import joblib


def train_model(X, y):
    rf = RandomForestClassifier(n_estimators=100, max_depth=10)
    rf.fit(X, y)
    joblib.dump(rf, 'random_forest_classifier.pkl')
    print("Model trained and saved.")
