"""Shared telemetry processing: turns one lap of raw samples into a compact,
distance-aligned trace with estimated g-forces.

Public timing data has no accelerometer channel. Longitudinal g is derived from
the change in speed over time; lateral g from speed squared times the curvature
of the car's position path. Both are estimates and are labelled as such in the app.
Brake is on/off only in the public feed, so pressure is not available.
"""
import numpy as np

G = 9.81
N_POINTS = 420  # samples per lap after resampling along distance


def _smooth(a, w):
    a = np.asarray(a, float)
    if w <= 1 or len(a) < w:
        return a
    k = np.ones(w) / w
    pad = w // 2
    return np.convolve(np.pad(a, pad, mode="edge"), k, mode="valid")[: len(a)]


def process_lap(t, speed_kmh, throttle, brake, gear, rpm, x, y):
    """All inputs are equal-length arrays sampled at the same timestamps.
    t is seconds from lap start. Returns a dict of rounded lists, or None."""
    t = np.asarray(t, float)
    if len(t) < 40:
        return None
    order = np.argsort(t)
    t = t[order]
    v = np.asarray(speed_kmh, float)[order] / 3.6
    arrs = {k: np.asarray(a, float)[order] for k, a in
            dict(thr=throttle, brk=brake, gear=gear, rpm=rpm, x=x, y=y).items()}

    # Distance by integrating speed (more reliable than raw position units)
    dt = np.diff(t, prepend=t[0])
    dist = np.cumsum(v * dt)
    keep = np.concatenate([[True], np.diff(dist) > 0.01])
    t, v, dist = t[keep], v[keep], dist[keep]
    arrs = {k: a[keep] for k, a in arrs.items()}
    total = dist[-1]
    if total < 1000:
        return None

    # Longitudinal g on the time series
    glong = np.gradient(_smooth(v, 3), t) / G

    # Resample everything evenly along distance
    d = np.linspace(0, total, N_POINTS)
    r = lambda a: np.interp(d, dist, a)
    vs = r(v)
    xs, ys = r(arrs["x"]), r(arrs["y"])

    # Scale position units to metres using the integrated distance
    path = np.sum(np.hypot(np.diff(xs), np.diff(ys)))
    scale = total / path if path > 0 else 0.1
    xm, ym = _smooth(xs * scale, 5), _smooth(ys * scale, 5)

    # Lateral g from curvature of the smoothed path
    heading = np.unwrap(np.arctan2(np.gradient(ym), np.gradient(xm)))
    ds = total / (N_POINTS - 1)
    curvature = _smooth(np.gradient(heading, ds), 7)
    glat = np.clip(vs ** 2 * curvature / G, -7, 7)

    return {
        "d": np.round(d).astype(int).tolist(),
        "x": np.round(xm, 1).tolist(),
        "y": np.round(ym, 1).tolist(),
        "spd": np.round(vs * 3.6).astype(int).tolist(),
        "thr": np.clip(np.round(r(arrs["thr"])), 0, 100).astype(int).tolist(),
        "brk": (r(arrs["brk"]) > 0.5).astype(int).tolist(),
        "gear": np.round(r(arrs["gear"])).astype(int).tolist(),
        "rpm": (np.round(r(arrs["rpm"]) / 10) * 10).astype(int).tolist(),
        "gx": np.round(np.clip(r(_smooth(glong, 3)), -7, 4), 2).tolist(),
        "gy": np.round(glat, 2).tolist(),
    }
