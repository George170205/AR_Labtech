/**
 * Rectifica la perspectiva del papel usando transformación homográfica.
 *
 * INTER_LINEAR: ~3x más rápido que LANCZOS4, calidad suficiente para Fase 2.
 * Cambiar a INTER_LANCZOS4 si los colores quedan pixelados en zonas pequeñas.
 *
 * @param {object} cv
 * @param {cv.Mat} src      Mat RGBA de entrada
 * @param {Array}  corners  [TL, TR, BR, BL] en coords de src
 * @returns {cv.Mat}        Mat rectificado — caller debe llamar .delete()
 */
export function warpPaper(cv, src, corners) {
    const [tl, tr, br, bl] = corners;

    const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

    // Las dimensiones del output se calculan como el máximo de los lados opuestos
    // para preservar la relación de aspecto real del papel
    const outWidth = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
    const outHeight = Math.round(Math.max(dist(tl, bl), dist(tr, br)));

    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        tl.x, tl.y,
        tr.x, tr.y,
        br.x, br.y,
        bl.x, bl.y,
    ]);

    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        outWidth - 1, 0,
        outWidth - 1, outHeight - 1,
        0, outHeight - 1,
    ]);

    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    const warped = new cv.Mat();
    cv.warpPerspective(
        src,
        warped,
        M,
        new cv.Size(outWidth, outHeight),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar(0, 0, 0, 0),
    );

    srcPts.delete();
    dstPts.delete();
    M.delete();

    return warped; // RGBA, listo para cv.imshow o Fase 2
}