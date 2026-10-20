#!/usr/bin/env node
/**
 * generar-lista.js
 * Crea el archivo files.json que tu launcher usa para descargar los mods
 * y archivos de una instancia (campo "url" de la instancia).
 *
 * Uso (desde la carpeta raíz de tu repositorio tunkilauncher):
 *     node generar-lista.js los-compas
 *
 * Espera esta estructura:
 *     instancias/los-compas/mods/mod1.jar
 *     instancias/los-compas/config/algo.toml
 *     ...
 * y genera:
 *     instancias/los-compas/files.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// >>> Cambia esto solo si cambias de repositorio o de rama <<<
const BASE_RAW = 'https://raw.githubusercontent.com/MiclaStudio/tunkilauncher/main';
const CARPETA_INSTANCIAS = 'instancias';
const SALIDA = 'files.json';
const IGNORAR = new Set([SALIDA, '.DS_Store', 'Thumbs.db', 'desktop.ini', '.gitkeep']);

const nombre = process.argv[2];
if (!nombre) {
    console.error('Falta el nombre de la instancia.\nEjemplo: node generar-lista.js los-compas');
    process.exit(1);
}

const raiz = path.join(process.cwd(), CARPETA_INSTANCIAS, nombre);
if (!fs.existsSync(raiz) || !fs.statSync(raiz).isDirectory()) {
    console.error(`No existe la carpeta: ${raiz}\nCréala y pon dentro tus mods, config, etc.`);
    process.exit(1);
}

function listar(dir) {
    let salida = [];
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORAR.has(entrada.name)) continue;
        const completa = path.join(dir, entrada.name);
        if (entrada.isDirectory()) salida = salida.concat(listar(completa));
        else if (entrada.isFile()) salida.push(completa);
    }
    return salida;
}

function sha1(archivo) {
    const hash = crypto.createHash('sha1');
    hash.update(fs.readFileSync(archivo));
    return hash.digest('hex');
}

const baseInstancia = `${BASE_RAW}/${CARPETA_INSTANCIAS}/${encodeURIComponent(nombre)}`;
const lista = listar(raiz)
    .sort()
    .map((archivo) => {
        const rel = path.relative(raiz, archivo).split(path.sep).join('/');
        return {
            path: rel,
            hash: sha1(archivo),
            size: fs.statSync(archivo).size,
            url: `${baseInstancia}/${rel.split('/').map(encodeURIComponent).join('/')}`,
        };
    });

fs.writeFileSync(path.join(raiz, SALIDA), JSON.stringify(lista, null, 2));

const grandes = lista.filter((f) => f.size > 50 * 1024 * 1024);
console.log(`Listo: ${lista.length} archivos en ${CARPETA_INSTANCIAS}/${nombre}/${SALIDA}`);
console.log(`\nEn el admin, pon este valor en "URL de archivos" de la instancia:\n  ${baseInstancia}/${SALIDA}\n`);
if (grandes.length) {
    console.warn('AVISO: estos archivos pasan de 50 MB (GitHub avisa a partir de 50 MB y bloquea a los 100 MB):');
    grandes.forEach((f) => console.warn(`  - ${f.path} (${(f.size / 1048576).toFixed(1)} MB)`));
}
