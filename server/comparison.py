import matplotlib
import pandas as pd
import joblib
import matplotlib.pyplot as plt
matplotlib.use('Agg')
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split


def compare_models():
    # 1. Prepare Test Data (Same as your previous logic)
    ecg = pd.read_csv('ECG_FeaturesExtracted.csv')
    eye = pd.read_csv('EyeTracking_FeaturesExtracted.csv')
    data = pd.concat([eye, ecg.drop('Quad_Cat', axis=1)], axis=1)
    mapping = {0: 4, 1: 3, 2: 1, 3: 2}
    data['target_state'] = data['Quad_Cat'].map(mapping)

    _, test_data = train_test_split(data, test_size=0.2, random_state=42, stratify=data['target_state'])

    models_config = {
        'HR Only': ('hr_only_model.pkl', ['Bpm']),
        'Gaze Only': ('gaze_only_model.pkl', ['Mean_Fixation_Duration', 'Num_of_Fixations', 'Mean_Saccade_Duration']),
        'Fusion (HR + Gaze)': (
        'gaze_rf_model.pkl', ['Mean_Fixation_Duration', 'Num_of_Fixations', 'Mean_Saccade_Duration', 'Bpm'])
    }

    results = []
    for name, (path, features) in models_config.items():
        try:
            model = joblib.load(path)
            X_test = test_data[features].fillna(0)
            y_pred = model.predict(X_test)
            results.append({'Model': name, 'Accuracy': accuracy_score(test_data['target_state'], y_pred)})
        except:
            continue

    res_df = pd.DataFrame(results).sort_values('Accuracy', ascending=False)

    plt.figure(figsize=(10, 7))
    colors = ['#4A90E2', '#5DA5DA', '#93C47D']
    bars = plt.bar(res_df['Model'], res_df['Accuracy'], color=colors, edgecolor='black', alpha=0.8)

    plt.xticks(rotation=0, fontsize=11, fontweight='bold')

    for bar in bars:
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width() / 2., height + 0.01,
                 f'{height:.2%}', ha='center', va='bottom', fontsize=12, fontweight='bold')

    plt.axhline(y=0.25, color='red', linestyle='--', linewidth=2, label='Chance Level (25%)')
    plt.title('Performance Comparison: Does Fusion Improve Classification?', fontsize=14, pad=20)
    plt.ylabel('Classification Accuracy', fontsize=12)
    plt.ylim(0, 0.5)
    plt.grid(axis='y', linestyle=':', alpha=0.7)
    plt.legend(loc='upper right')

    plt.tight_layout()
    plt.savefig('comparison_plot.png')
    plt.show()


if __name__ == "__main__":
    compare_models()
