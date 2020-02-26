/**
 * Polygon utils functions.
 * @copyright CEA-LIST/DIASI/SIALV/LVA (2019)
 * @author CEA-LIST/DIASI/SIALV/LVA <pixano@cea.fr>
 * @license CECILL-C
 */

/**
 * Check if polygon self intersects
 * TODO: implement Shamos-Hoey (faster)
 * @param inputVertices flatten array of 2d vertices
 */
export const isValid = (inputVertices: number[]) => {
    const vertices = chunk(inputVertices, 2);
    for (const [idx, value] of vertices.entries()) {
        const nextIdx = (idx + 1) % vertices.length;
        for (const [idx2, value2] of vertices.entries()) {
            if (idx2 === idx) continue;
            const nextIdx2 = (idx2 + 1) % vertices.length;
            if (idx2 === nextIdx || nextIdx2 === idx) {
              continue;
            }
            const inter = intersects(value[0],
                                    value[1],
                                    vertices[nextIdx][0],
                                    vertices[nextIdx][1],
                                    value2[0],
                                    value2[1],
                                    vertices[nextIdx2][0],
                                    vertices[nextIdx2][1]);
            if (inter) {
              return false;
            }
        }
    }
    return true;
}

export function chunk(arr: number[], chunkSize: number): number[][] {
    const chunkedArr: number[][] = [];
    for (const el of arr) {
        const last = chunkedArr[chunkedArr.length - 1];
        if (!last || last.length === chunkSize) {
            chunkedArr.push([el]);
        } else {
            last.push(el);
        }
    }
    return chunkedArr;
}

/**
 * Check intersection of two lines.
 * @param a x of point 1 of line 1
 * @param b y of point 1 of line 1
 * @param c x of point 2 of line 1
 * @param d y of point 2 of line 1
 * @param p x of point 1 of line 2
 * @param q y of point 1 of line 2
 * @param r x of point 2 of line 2
 * @param s y of point 2 of line 2
 * returns: true iff the line from (a,b)->(c,d) intersects with (p,q)->(r,s)
 */
function intersects(a: number, b: number, c: number, d: number, p: number, q: number, r: number, s: number): boolean {
    const det = (c - a) * (s - q) - (r - p) * (d - b);
    if (det === 0) {
        return false;
    } else {
        const lambda = ((s - q) * (r - a) + (p - r) * (s - b)) / det;
        const gamma = ((b - d) * (r - a) + (c - a) * (s - b)) / det;
        return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
    }
  };


/**
 * Square distance between 2 points
 * @param p1
 * @param p2
 */
function getSqDist(p1: [number, number], p2: [number, number]) {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return dx * dx + dy * dy;
}

/**
 * Square distance from a point to a segment
 * @param p Point
 * @param p1 Point 1 of segment
 * @param p2 Point 2 of segment
 */
function getSqSegDist(p: [number, number], p1: [number, number], p2: [number, number]) {
    let [x, y] = p1;
    let dx = p2[0] - x;
    let dy = p2[1] - y;
    if (dx !== 0 || dy !== 0) {
        const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
            x = p2[0];
            y = p2[1];

        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
}

/**
 * Basic distance-based simplification
 * @param points Array of points
 * @param sqTolerance
 */
function simplifyRadialDist(points: [number, number][], sqTolerance: number) {

    let prevPoint = points[0];
    const newPoints = [prevPoint];
    let point: [number, number] = [-1, -1];

    for (point of points) {
        if (getSqDist(point, prevPoint) > sqTolerance) {
            newPoints.push(point);
            prevPoint = point;
        }
    }
    if (prevPoint !== point) newPoints.push(point);

    return newPoints;
}

/**
 * Simplify polygon
 * @param points Array of points
 * @param first
 * @param last
 * @param sqTolerance
 * @param simplified
 */
function simplifyDPStep(points: [number, number][], first: number, last: number, sqTolerance: number, simplified: number[][]) {
    let maxSqDist = sqTolerance;
    let index: number = -1;

    for (let i = first + 1; i < last; i++) {
        const sqDist = getSqSegDist(points[i], points[first], points[last]);

        if (sqDist > maxSqDist) {
            index = i;
            maxSqDist = sqDist;
        }
    }

    if (maxSqDist > sqTolerance) {
        if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
        simplified.push(points[index]);
        if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
    }
}

// simplification using Ramer-Douglas-Peucker algorithm
function simplifyDouglasPeucker(points: [number, number][], sqTolerance: number) {
    const last = points.length - 1;
    const simplified = [points[0]];
    simplifyDPStep(points, 0, last, sqTolerance, simplified);
    simplified.push(points[last]);
    return simplified;
}

/**
 * Simplify polygon
 * @param points Array<[number, number]> input points
 * @param tolerance
 * @param highestQuality
 */
export function simplify(points: [number, number][], tolerance: number, highestQuality: boolean = false) {

  if (points.length <= 2) return points;

  const sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;
  points = highestQuality ? points : simplifyRadialDist(points, sqTolerance);
  points = simplifyDouglasPeucker(points, sqTolerance);

  return points;
}
