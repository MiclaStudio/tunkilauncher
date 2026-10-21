#!/usr/bin/env node
/**
 * generar-lista.js
 * Crea el archivo files.json que tu launcher usa para descargar los mods
 * y archivos de una instancia (campo "URL de archivos" de la instancia).
 *
 * USO BÁSICO (desde la raíz de tu repositorio tunkilauncher):
 *     node generar-lista.js planetav
 *
 *   Lee:     instancias/planetav/...   (mods, config, shaderpacks, etc.)
 *   Genera:  instancias/planetav/files.json
 *
 * ARCHIVOS MUY GRANDES (GitHub no acepta archivos de 100 MB o más en el repositorio):
 *   1. Sácalos del repositorio y ponlos en otra carpeta, FUERA del repo, con la misma
 *      estructura de rutas. Ejemplo:  C:\grandes\planetav\mods\mod-gigante.jar
 *   2. Súbelos como archivos de una "Release" de GitHub (hasta 2 GB cada uno).
 *   3. Ejecuta:
 *        node generar-lista.js planetav --grandes "C:\grandes\planetav" ^
 *             --release https://github.com/MiclaStudio/tunkilauncher/releases/download/planetav-mods
 *      El script añade esos archivos a files.json con la dirección de la Release.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// >>> Cambia esto solo si cambias de repositorio o de rama <<<
const BASE_RAW = 'https://raw.githubusercontent.com/MiclaStudio/tunkilauncher/main';
const CARPETA_INSTANCIAS = 'instancias';
const SALIDA = 'files.json';
const IGNORAR = new Set([SALIDA, '.DS_Store', 'Thumbs.db', 'desktop.ini', '.gitkeep']);
const MB = 1024 * 1024;
const LIMITE_GITHUB = 100 * MB; // GitHub no deja subir archivos de 100 MB o más
const AVISO = 50 * MB;

// ---------- Argumentos ----------
const args = process.argv.slice(2);
const nombre = args.find((a) => !a.startsWith('--'));
function opcion(nom) {
    const i = args.indexOf(nom);
    return i >= 0 ? args[i + 1] : null;
}
const carpetaGrandes = opcion('--grandes');
const baseRelease = opcion('--release');

function salir(msg) {
    console.error(msg);
    process.exit(1);
}

if (!nombre) salir('Falta el nombre de la instancia.\nEjemplo: node generar-lista.js planetav');
if ((carpetaGrandes && !baseRelease) || (!carpetaGrandes && baseRelease)) {
    salir('Usa --grandes y --release juntos.\nEjemplo: node generar-lista.js planetav --grandes "C:\\grandes\\planetav" --release https://github.com/USUARIO/REPO/releases/download/TAG');
}

const raiz = path.join(process.cwd(), CARPETA_INSTANCIAS, nombre);
if (!fs.existsSync(raiz) || !fs.statSync(raiz).isDirectory()) {
    salir(`No existe la carpeta: ${raiz}\nCréala y pon dentro tus mods, config, etc.`);
}
if (carpetaGrandes && (!fs.existsSync(carpetaGrandes) || !fs.statSync(carpetaGrandes).isDirectory())) {
    salir(`No existe la carpeta de archivos grandes: ${carpetaGrandes}`);
}

// ---------- Utilidades ----------
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
    // Se lee por partes para no cargar archivos grandes completos en memoria
    const hash = crypto.createHash('sha1');
    const fd = fs.openSync(archivo, 'r');
    const buf = Buffer.alloc(4 * MB);
    let leidos;
    while ((leidos = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, leidos));
    fs.closeSync(fd);
    return hash.digest('hex');
}

const rutaRel = (base, archivo) => path.relative(base, archivo).split(path.sep).join('/');
const codificar = (rel) => rel.split('/').map(encodeURIComponent).join('/');

// ---------- Archivos del repositorio ----------
const baseInstancia = `${BASE_RAW}/${CARPETA_INSTANCIAS}/${encodeURIComponent(nombre)}`;
const archivosRepo = listar(raiz).sort();

const demasiado = archivosRepo.filter((f) => fs.statSync(f).size >= LIMITE_GITHUB);
if (demasiado.length) {
    console.error('Estos archivos pesan 100 MB o más y GitHub NO los acepta en el repositorio:');
    demasiado.forEach((f) => console.error(`  - ${rutaRel(raiz, f)} (${(fs.statSync(f).size / MB).toFixed(0)} MB)`));
    salir(
        '\nMuévelos fuera del repositorio, a una carpeta aparte con la misma estructura de rutas ' +
        '(por ejemplo C:\\grandes\\' + nombre + '\\mods\\), súbelos a una Release de GitHub y ejecuta:\n' +
        `  node generar-lista.js ${nombre} --grandes "C:\\grandes\\${nombre}" --release https://github.com/USUARIO/REPO/releases/download/TAG`
    );
}

const lista = archivosRepo.map((archivo) => {
    const rel = rutaRel(raiz, archivo);
    return { path: rel, hash: sha1(archivo), size: fs.statSync(archivo).size, url: `${baseInstancia}/${codificar(rel)}` };
});

// ---------- Archivos grandes (alojados en una Release) ----------
let nGrandes = 0;
if (carpetaGrandes) {
    const base = baseRelease.replace(/\/+$/, '');
    const vistos = new Set(lista.map((f) => f.path));
    const nombresPlanos = new Map();
    for (const archivo of listar(carpetaGrandes).sort()) {
        const rel = rutaRel(carpetaGrandes, archivo);
        const plano = path.basename(archivo);
        if (vistos.has(rel)) salir(`El archivo "${rel}" está en el repositorio y en la carpeta de grandes. Déjalo solo en una.`);
        if (nombresPlanos.has(plano)) {
            salir(`Dos archivos grandes se llaman igual ("${plano}"). En una Release los nombres no pueden repetirse.`);
        }
        if (/\s/.test(plano)) {
            console.warn(`AVISO: "${plano}" tiene espacios. GitHub los cambia por puntos al subirlo a la Release y la descarga fallaría. Renómbralo sin espacios.`);
        }
        nombresPlanos.set(plano, true);
        vistos.add(rel);
        lista.push({ path: rel, hash: sha1(archivo), size: fs.statSync(archivo).size, url: `${base}/${encodeURIComponent(plano)}` });
        nGrandes++;
    }
}

lista.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
fs.writeFileSync(path.join(raiz, SALIDA), JSON.stringify(lista, null, 2));

// ---------- Resumen ----------
console.log(`Listo: ${lista.length} archivos en ${CARPETA_INSTANCIAS}/${nombre}/${SALIDA}` + (nGrandes ? ` (${nGrandes} alojados en la Release)` : ''));
console.log(`\nEn el admin, pon este valor en "URL de archivos" de la instancia:\n  ${baseInstancia}/${SALIDA}\n`);
const medianos = archivosRepo.filter((f) => fs.statSync(f).size >= AVISO);
if (medianos.length) {
    console.warn('AVISO: estos archivos pasan de 50 MB (GitHub avisa a partir de 50 MB y bloquea a los 100 MB):');
    medianos.forEach((f) => console.warn(`  - ${rutaRel(raiz, f)} (${(fs.statSync(f).size / MB).toFixed(1)} MB)`));
}
const total = lista.reduce((s, f) => s + f.size, 0);
console.log(`Tamaño total de la instancia: ${(total / 1024 / MB).toFixed(2)} GB`);
