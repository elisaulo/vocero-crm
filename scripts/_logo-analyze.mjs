import sharp from "sharp";

const { data, info } = await sharp("public/jombe-logo.jpg")
    .raw()
    .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const px = (x, y) => {
    const i = (y * width + x) * channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
};

// Fondo (esquina)
console.log("fondo", px(2, 2), px(width - 3, height - 3));

const isPurple = ({ r, g, b }) => b > 120 && b - r > 40 && b - g > 60 && g < 130;
const isGreen = ({ r, g, b }) => g > 100 && g - r > 50 && g - b > 20;
const isWhite = ({ r, g, b }) => r > 190 && g > 190 && b > 190;

function bbox(pred, x0 = 0, x1 = width, y0 = 0, y1 = height) {
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            if (pred(px(x, y))) {
                n++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (!n) return null;
    return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1, n };
}

const all = bbox(() => true);
console.log("img", width, height);
console.log("purple", bbox(isPurple));
console.log("green", bbox(isGreen));
console.log("white", bbox(isWhite));
console.log("ink (no fondo)", bbox((c) => !(c.r < 45 && c.g < 60 && c.b < 80)));

// color medio de las formas
function avg(pred) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const c = px(x, y);
        if (pred(c)) { r += c.r; g += c.g; b += c.b; n++; }
    }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), n };
}
const hex = ({ r, g, b }) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
console.log("avgPurple", hex(avg(isPurple)));
console.log("avgGreen", hex(avg(isGreen)));
console.log("avgBg", hex(avg((c) => c.r < 45 && c.g < 60 && c.b < 80 && c.b > 15)));
