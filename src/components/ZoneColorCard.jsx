export default function ZoneColorCard({ zoneId, result }) {
    const { label, status, rgb, rawHex, name, confidence, deltaE, clusters } = result;

    if (status === 'uncolored') {
        return (
            <div className="zcc-card zcc-card--empty">
                <div className="zcc-swatch zcc-swatch--empty" />
                <div className="zcc-info">
                    <span className="zcc-label">{label}</span>
                    <span className="zcc-name zcc-name--empty">Sin colorear</span>
                </div>
            </div>
        );
    }

    if (status === 'pending' || status === 'error') {
        return (
            <div className="zcc-card zcc-card--loading">
                <div className="zcc-swatch zcc-swatch--pulse" style={{ background: rawHex ?? '#ccc' }} />
                <span className="zcc-label">{label}</span>
            </div>
        );
    }

    const confidenceColor = { alta: '#00cc66', media: '#ffa500', baja: '#ff4444' };

    return (
        <div className="zcc-card">
            {/* Muestra el color detectado exacto (rawHex) y el nombre de paleta (hex) */}
            <div className="zcc-swatches">
                <div
                    className="zcc-swatch zcc-swatch--raw"
                    style={{ background: rawHex }}
                    title="Color detectado exacto"
                />
                {clusters.slice(0, 3).map((cl, i) => (
                    <div
                        key={i}
                        className="zcc-swatch zcc-swatch--cluster"
                        style={{
                            background: `rgb(${cl.rgb.join(',')})`,
                            flex: cl.ratio,
                        }}
                        title={`${Math.round(cl.ratio * 100)}%`}
                    />
                ))}
            </div>

            <div className="zcc-info">
                <span className="zcc-label">{label}</span>
                <span className="zcc-name">{name}</span>
                <div className="zcc-meta">
                    <span
                        className="zcc-confidence"
                        style={{ color: confidenceColor[confidence] }}
                    >
                        {confidence}
                    </span>
                    <span className="zcc-delta">ΔE {deltaE?.toFixed(1)}</span>
                </div>
            </div>
        </div>
    );
}