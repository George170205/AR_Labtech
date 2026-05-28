export async function parseZoneCandidates(svgString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = doc.documentElement;

    if (svgElement.tagName.toLowerCase() !== 'svg') {
        throw new Error("Invalid SVG");
    }

    // Attach to DOM invisibly to compute BBox
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.visibility = 'hidden';
    container.style.width = '0px';
    container.style.height = '0px';
    container.style.overflow = 'hidden';
    
    // Clone node to avoid mutating original doc yet
    const clonedSvg = svgElement.cloneNode(true);
    container.appendChild(clonedSvg);
    document.body.appendChild(container);

    const candidates = [];
    
    // We look at direct children of the SVG
    const children = Array.from(clonedSvg.children);

    let counter = 1;

    children.forEach((el, index) => {
        const tag = el.tagName.toLowerCase();
        // Ignore <defs>, <style>, <rect> that looks like the background
        if (tag === 'defs' || tag === 'style') return;
        
        // Let's assume background is a rect that is very large or first
        if (tag === 'rect' && index === 0) return;

        // Valid candidates: <g>, <path>, <ellipse>, <circle>, <polygon>, <rect>
        const validTags = ['g', 'path', 'ellipse', 'circle', 'polygon', 'rect', 'polyline'];
        if (!validTags.includes(tag)) return;

        let bbox = { x: 0, y: 0, width: 0, height: 0 };
        try {
            if (typeof el.getBBox === 'function') {
                const box = el.getBBox();
                bbox = { x: box.x, y: box.y, width: box.width, height: box.height };
            }
        } catch (e) {
            // Ignore error
        }

        // Try to get a suggested name from ID or use a fallback
        let suggestedName = el.id || `zona_${counter}`;
        
        // Clean Illustrator/Inkscape layer names like "capa_cola"
        suggestedName = suggestedName.replace(/capa_|layer_/i, '').replace(/[-_]/g, ' ').trim();
        
        // Make sure it has something inside
        const hasChildren = el.children.length > 0;

        // Add to candidates
        candidates.push({
            id: `cand_${counter}`,
            originalId: el.id,
            tagName: tag,
            suggestedName,
            bbox,
            hasChildren,
            element: el, // The DOM element reference (from cloned SVG)
            originalIndex: index
        });

        counter++;
    });

    // Cleanup
    document.body.removeChild(container);

    return candidates;
}
