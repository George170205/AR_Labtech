export function injectZoneMetadata(svgString, zonesConfig) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = doc.documentElement;

    if (svgElement.tagName.toLowerCase() !== 'svg') {
        throw new Error('Invalid SVG');
    }

    // Clean up proprietary attributes at root
    ['inkscape', 'sodipodi', 'illustrator'].forEach(ns => {
        const toRemove = [];
        for (let i = 0; i < svgElement.attributes.length; i++) {
            const attr = svgElement.attributes[i];
            if (attr.name.includes(`:${ns}`) || attr.name.includes(`xmlns:${ns}`)) {
                toRemove.push(attr.name);
            }
        }
        toRemove.forEach(name => svgElement.removeAttribute(name));
    });

    // Ensure viewBox exists
    if (!svgElement.hasAttribute('viewBox')) {
        let width = svgElement.getAttribute('width') || 500;
        let height = svgElement.getAttribute('height') || 380;
        // Strip 'px' if present
        width = width.toString().replace('px', '');
        height = height.toString().replace('px', '');
        svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    // Iterate through configuration and apply to elements
    zonesConfig.forEach((config, elementId) => {
        // If it's the contours layer
        if (config.isContours) {
            const el = doc.getElementById(elementId);
            if (el) {
                el.setAttribute('id', 'contornos');
                el.removeAttribute('data-zone');
            }
            return;
        }

        // Normal zone
        const el = doc.getElementById(elementId);
        if (el) {
            el.setAttribute('data-zone', config.zoneId || elementId);
            el.setAttribute('data-label', config.label || '');
            if (config.pivotX !== undefined) el.setAttribute('data-pivot-x', config.pivotX);
            if (config.pivotY !== undefined) el.setAttribute('data-pivot-y', config.pivotY);
            if (config.anim) el.setAttribute('data-anim', config.anim);
            if (config.amplitude !== undefined) el.setAttribute('data-anim-amplitude', config.amplitude);
            if (config.speed !== undefined) el.setAttribute('data-anim-speed', config.speed);
            if (config.offset !== undefined) el.setAttribute('data-anim-offset', config.offset);
        }
    });

    // Serialize back to string
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
}
