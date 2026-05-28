export function validateSVG(svgString) {
    const result = {
        valid: true,
        errors: [],
        warnings: [],
        groupCount: 0,
    };

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');

        // Check for XML parsing errors
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
            result.valid = false;
            result.errors.push('El archivo no es un XML válido.');
            return result;
        }

        // Check for root <svg> element
        const svgElement = doc.documentElement;
        if (svgElement.tagName.toLowerCase() !== 'svg') {
            result.valid = false;
            result.errors.push('El elemento raíz debe ser <svg>.');
            return result;
        }

        // Check for viewBox
        if (!svgElement.hasAttribute('viewBox')) {
            result.valid = false;
            result.errors.push('El archivo SVG debe tener un atributo viewBox.');
        }

        // Count top-level valid groups
        const groups = Array.from(svgElement.children).filter(
            (el) => el.tagName.toLowerCase() === 'g' || el.tagName.toLowerCase() === 'path'
        );
        result.groupCount = groups.length;

        if (result.groupCount === 0) {
            result.warnings.push('No se detectaron grupos <g> ni <path> de primer nivel. Puede ser difícil de configurar.');
        }

        // Detect proprietary attributes (Illustrator/Inkscape)
        const proprietaryNamespaces = ['inkscape', 'sodipodi', 'illustrator'];
        let hasProprietary = false;
        
        // Very basic check for namespace declarations
        proprietaryNamespaces.forEach(ns => {
            if (svgString.includes(`xmlns:${ns}`)) {
                hasProprietary = true;
            }
        });

        if (hasProprietary) {
            result.warnings.push('Se detectaron metadatos propietarios (Inkscape/Illustrator). Serán limpiados automáticamente.');
        }

    } catch (e) {
        result.valid = false;
        result.errors.push('Error crítico al procesar el archivo SVG.');
    }

    return result;
}
