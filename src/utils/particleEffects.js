import * as PIXI from 'pixi.js';

// ─── Burst de celebración ─────────────────────────────────────────────────────

/**
 * 90 partículas de confeti que explotan desde el centro del dinosaurio.
 * Los colores provienen del ZoneColorMap del niño.
 *
 * @param {PIXI.Application} app
 * @param {PIXI.Container}   parent      contenedor raíz de la escena
 * @param {number}           cx          X del burst (coords SVG)
 * @param {number}           cy          Y del burst
 * @param {number[]}         hexColors   Array de 0xRRGGBB
 */
export function burstCelebration(app, parent, cx, cy, hexColors) {
    const PARTICLE_COUNT = 90;
    const fallback = [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xc77dff];
    const colors = hexColors.length > 0 ? hexColors : fallback;

    const container = new PIXI.Container();
    parent.addChild(container);

    const particles = Array.from({ length: PARTICLE_COUNT }, () =>
        spawnConfetti(container, cx, cy, colors),
    );

    const tick = () => {
        let alive = 0;

        for (const p of particles) {
            if (p.life <= 0) { p.gfx.visible = false; continue; }

            p.vy += p.gravity;
            p.vx *= 0.985; // resistencia del aire
            p.gfx.x += p.vx;
            p.gfx.y += p.vy;
            p.gfx.rotation += p.rotSpeed;
            p.life -= p.decay;
            p.gfx.alpha = Math.max(0, p.life);
            alive++;
        }

        if (alive === 0) {
            app.ticker.remove(tick);
            container.destroy({ children: true });
        }
    };

    app.ticker.add(tick);
    return { stop: () => { app.ticker.remove(tick); container.destroy({ children: true }); } };
}

function spawnConfetti(container, cx, cy, colors) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 5.5;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 4 + Math.random() * 9;
    const shape = Math.floor(Math.random() * 3); // 0=círculo, 1=cuadrado, 2=rombo

    const gfx = new PIXI.Graphics();
    gfx.beginFill(color, 1);
    if (shape === 0) gfx.drawCircle(0, 0, size / 2);
    else if (shape === 1) gfx.drawRect(-size / 2, -size / 2, size, size);
    else gfx.drawPolygon([0, -size / 2, size / 2, 0, 0, size / 2, -size / 2, 0]);
    gfx.endFill();
    gfx.x = cx;
    gfx.y = cy;
    container.addChild(gfx);

    return {
        gfx,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 4, // sesgo hacia arriba
        gravity: 0.10 + Math.random() * 0.08,
        rotSpeed: (Math.random() - 0.5) * 0.25,
        life: 0.85 + Math.random() * 0.45,
        decay: 0.007 + Math.random() * 0.011,
    };
}

// ─── Sparkles continuos ───────────────────────────────────────────────────────

/**
 * Genera chispas de 4 puntas que aparecen y desaparecen aleatoriamente
 * en la escena mientras el dinosaurio está animado.
 *
 * Usa un pool de Graphics reutilizables para evitar alloc/GC continuo.
 */
export function startSparkles(app, parent, svgW, svgH) {
    const POOL_SIZE = 15;
    const SPAWN_RATE = 7;  // frames entre chispas

    const container = new PIXI.Container();
    parent.addChild(container);

    // Pool de Graphics pre-creados (estrella de 4 puntas)
    const pool = Array.from({ length: POOL_SIZE }, () => {
        const g = new PIXI.Graphics();
        g.visible = false;
        container.addChild(g);
        return { gfx: g, life: 0, active: false };
    });

    let frameCount = 0;

    const tick = (delta) => {
        frameCount += delta;

        // Emitir
        if (frameCount >= SPAWN_RATE) {
            frameCount = 0;
            const slot = pool.find((p) => !p.active);
            if (slot) activateSparkle(slot, svgW, svgH);
        }

        // Actualizar
        for (const p of pool) {
            if (!p.active) continue;
            p.life -= 0.04;

            // Fade-in/out con seno: pico en life=0.5
            p.gfx.alpha = Math.sin(p.life * Math.PI);
            p.gfx.scale.set(0.4 + p.life * 1.2);
            p.gfx.rotation += 0.04;

            if (p.life <= 0) {
                p.active = false;
                p.gfx.visible = false;
            }
        }
    };

    app.ticker.add(tick);

    return {
        stop() {
            app.ticker.remove(tick);
            container.destroy({ children: true });
        },
    };
}

function activateSparkle(slot, svgW, svgH) {
    const { gfx } = slot;
    const r1 = 5 + Math.random() * 5; // radio exterior
    const r2 = r1 * 0.35;             // radio interior

    gfx.clear();
    gfx.beginFill(0xffffff, 1);

    // Estrella de 4 puntas (8 vértices)
    const pts = [];
    for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const r = i % 2 === 0 ? r1 : r2;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    gfx.drawPolygon(pts);
    gfx.endFill();

    gfx.x = 20 + Math.random() * (svgW - 40);
    gfx.y = 20 + Math.random() * (svgH - 40);
    gfx.alpha = 0;
    gfx.visible = true;

    slot.life = 1.0;
    slot.active = true;
}