import numpy as np
import pandas as pd
from typing import List, Dict, Any


def detect_fixations(gaze_points: List[Dict], distance_threshold: int = 50, duration_threshold: int = 100) -> List[Dict]:
    """
    Identify fixations using I-DT (Identification by Duration Threshold) algorithm.
    
    Parameters:
    - gaze_points: List of dicts with keys: 't', 'x', 'y', 'aoi'
    - distance_threshold: Max pixel distance to be considered same fixation (default 50px)
    - duration_threshold: Min duration in ms to be considered fixation (default 100ms)
    
    Returns:
    - List of fixations: [{'x': center_x, 'y': center_y, 'start': start_time, 'end': end_time, 'duration': duration, 'aoi': aoi}]
    """
    if len(gaze_points) == 0:
        return []
    
    fixations = []
    current_fixation = None
    
    for point in gaze_points:
        x, y, t = point['x'], point['y'], point['t']
        aoi = point.get('aoi', 'NONE')
        
        if current_fixation is None:
            current_fixation = {
                'x': [x],
                'y': [y],
                'start': t,
                'end': t,
                'aoi': aoi
            }
        else:
            # Calculate distance from fixation center
            center_x = np.mean(current_fixation['x'])
            center_y = np.mean(current_fixation['y'])
            dist = np.sqrt((x - center_x)**2 + (y - center_y)**2)
            
            # Check if same AOI (for better grouping)
            same_aoi = current_fixation.get('aoi') == aoi
            
            if dist <= distance_threshold and same_aoi:
                # Add to current fixation
                current_fixation['x'].append(x)
                current_fixation['y'].append(y)
                current_fixation['end'] = t
            else:
                # Check if previous fixation meets duration threshold
                duration = current_fixation['end'] - current_fixation['start']
                if duration >= duration_threshold:
                    fixations.append({
                        'x': np.mean(current_fixation['x']),
                        'y': np.mean(current_fixation['y']),
                        'start': current_fixation['start'],
                        'end': current_fixation['end'],
                        'duration': duration,
                        'aoi': current_fixation.get('aoi', 'NONE')
                    })
                
                # Start new fixation
                current_fixation = {
                    'x': [x],
                    'y': [y],
                    'start': t,
                    'end': t,
                    'aoi': aoi
                }
    
    # Don't forget the last fixation
    if current_fixation:
        duration = current_fixation['end'] - current_fixation['start']
        if duration >= duration_threshold:
            fixations.append({
                'x': np.mean(current_fixation['x']),
                'y': np.mean(current_fixation['y']),
                'start': current_fixation['start'],
                'end': current_fixation['end'],
                'duration': duration,
                'aoi': current_fixation.get('aoi', 'NONE')
            })
    
    return fixations


def compute_saccade_duration(fixations: List[Dict]) -> float:
    """
    Calculate mean saccade duration (time between fixations).
    
    Parameters:
    - fixations: List of fixation dicts with 'start' and 'end' keys
    
    Returns:
    - Mean saccade duration in milliseconds
    """
    if len(fixations) < 2:
        return 0.0
    
    saccade_durations = []
    for i in range(len(fixations) - 1):
        # Time from end of fixation i to start of fixation i+1
        saccade_duration = fixations[i + 1]['start'] - fixations[i]['end']
        if saccade_duration > 0:
            saccade_durations.append(saccade_duration)
    
    return np.mean(saccade_durations) if saccade_durations else 0.0


def calculate_reread_frequency(gaze_points: List[Dict]) -> int:
    """
    Count how many times user returns to a previously visited AOI.
    
    Parameters:
    - gaze_points: List of dicts with 'aoi' key
    
    Returns:
    - Re-read frequency count
    """
    if len(gaze_points) < 2:
        return 0
    
    visited_aois = []
    reread_count = 0
    
    for point in gaze_points:
        aoi = point.get('aoi', 'NONE')
        if aoi == 'NONE':
            continue
        
        if aoi in visited_aois:
            reread_count += 1
        else:
            visited_aois.append(aoi)
    
    return reread_count


def calculate_env_fixation_ratio(fixations: List[Dict], content_aois: List[str] = None) -> float:
    """
    Calculate ratio of fixations outside content areas (UI elements, etc.).
    
    Parameters:
    - fixations: List of fixation dicts with 'aoi' key
    - content_aois: List of AOI IDs that are content (e.g., ['p1', 'p2', 'p3', 'p4'])
                  If None, assumes all non-'NONE' AOIs are content
    
    Returns:
    - Ratio of environment fixations (0.0 to 1.0)
    """
    if len(fixations) == 0:
        return 0.0
    
    if content_aois is None:
        # Default: assume paragraphs (p1, p2, etc.) are content
        content_aois = [f'p{i}' for i in range(1, 10)]
    
    env_fixations = sum(1 for f in fixations if f.get('aoi', 'NONE') not in content_aois and f.get('aoi') != 'NONE')
    total_fixations = len(fixations)
    
    return env_fixations / total_fixations if total_fixations > 0 else 0.0


def extract_features_from_window(window_data: Dict[str, Any]) -> Dict[str, float]:
    """
    Extract features from raw window data for Random Forest model.
    
    Parameters:
    - window_data: Dict with keys:
        - 'gaze_log': List of gaze points [{'t': timestamp, 'x': x, 'y': y, 'aoi': aoi_id}]
        - 'interactions': List of interactions [{'t': timestamp, 'type': 'click'|'scroll'}]
        - 'heart_rate': List of HR samples [{'t': timestamp, 'bpm': bpm}]
    
    Returns:
    - Dict of features matching model expectations
    """
    gaze_log = window_data.get('gaze_log', [])
    interactions = window_data.get('interactions', [])
    heart_rate = window_data.get('heart_rate', [])
    
    # 1. Detect fixations using I-DT
    fixations = detect_fixations(gaze_log)
    
    # 2. Compute eye tracking features
    if len(fixations) > 0:
        mean_fixation_duration = np.mean([f['duration'] for f in fixations])
        num_fixations = len(fixations)
        mean_saccade_duration = compute_saccade_duration(fixations)
    else:
        mean_fixation_duration = 0.0
        num_fixations = 0
        mean_saccade_duration = 0.0
    
    # 3. Compute derived features
    reread_freq = calculate_reread_frequency(gaze_log)
    
    # Define content AOIs (paragraphs)
    content_aois = ['p1', 'p2', 'p3', 'p4']
    env_fixation_ratio = calculate_env_fixation_ratio(fixations, content_aois)
    
    click_count = len([i for i in interactions if i.get('type') == 'click'])
    
    # 4. Heart rate
    if len(heart_rate) > 0:
        mean_bpm = np.mean([hr['bpm'] for hr in heart_rate])
    else:
        mean_bpm = 0.0  # Default if no HR data
    
    # Return features matching model expectations
    features = {
        'Mean_Fixation_Duration': float(mean_fixation_duration),
        'Num_of_Fixations': float(num_fixations),
        'Mean_Saccade_Duration': float(mean_saccade_duration),
        'Bpm': float(mean_bpm)
    }
    
    return features
