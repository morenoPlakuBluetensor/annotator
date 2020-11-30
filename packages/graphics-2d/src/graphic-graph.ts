/**
 * Implementations of 2 graphical shapes.
 * @copyright CEA-LIST/DIASI/SIALV/LVA (2019)
 * @author CEA-LIST/DIASI/SIALV/LVA <pixano@cea.fr>
 * @license CECILL-C
 */

import { Graphics as PIXIGraphics, Rectangle as PIXIRectangle } from 'pixi.js';
import { Graphic } from './graphic';
import { ShapeData } from './types';

export interface IGraphSettings {
  radius: number;
  colorFillType: "unique" | "order";
  orderedColors: number[];
  // Set skeleton #keypoints with their names
  vertexNames: string[];
  // Set skeleton links between its vertices
  edges: [number, number][];
}

// common style shared by all skeletons
export const settings: IGraphSettings = {
  radius: 4,
  colorFillType: "unique",
  orderedColors: [
    0xF44336, 0xffff00, 0xFFFFFF,
    0X426eff, 0xFFFFFF, 0xFFFFFF
  ],
  edges: [[0,1], [0,2]],
  vertexNames: ['header', 'RFoot', 'LFoot']
}

/**
 * Skeleton graphic made of nodes and edges.
 */
export class GraphicGraph extends Graphic {

    public nodes: PIXIGraphics[] = [];

    public colors: number[]= [
      0xF44336, 0xffff00, 0xFFFFFF,
      0X426eff, 0xFFFFFF, 0xFFFFFF
    ];

    constructor(data: ShapeData) {
      super(data);
      if (this.data.geometry.vertices.length % 2 === 1) {
        // number of flatten vertices should be pair
        this.data.geometry.vertices = this.data.geometry.vertices.slice(0, -1);
      }
      this.nodes = new Array(0.5 * this.data.geometry.vertices.length).fill(null).map(() => {
        const n = new PIXIGraphics();
        this.nodeContainer.addChild(n);
        return n;
      });
      if (!this.data.geometry.visibles ||
           this.data.geometry.visibles.length !== this.nodes.length) {
        this.data.geometry.visibles = new Array(this.nodes.length).fill(true);
      }
    }

    onNode(event: string, fn: (evt: any) => void, context?: any) {
      this.nodes.forEach((n, idx) => {
          n.removeAllListeners();
          n.interactive = true;
          n.buttonMode = true;
          n.cursor = 'grab';
          n.on(event, (evt: any) => {
              evt.stopPropagation();
              evt.nodeIdx = idx;
              evt.shape = this.data;
              fn(evt);
          }, context);
      });
    }

    createNodes() {
        this.nodes = new Array(0.5 * this.data.geometry.vertices.length).fill(null).map(() => {
            const n = new PIXIGraphics();
            this.nodeContainer.addChild(n);
            return n;
        });
    }

    deleteNodes() {
        this.nodes.forEach((n) => { n.destroy(); this.nodeContainer.removeChild(n)});
    }

    draw() {
        this.area.clear();
        this.data.geometry.edges!.forEach((edge) => {
            let color = this.hex;
            color = this.state === 'nodes' ? 0X426eff : color;
            this.area.lineStyle(3, color || 0xFFFFFF, 1, 0.5, true);
            const sX = Math.round(this.data.geometry.vertices[edge[0] * 2] * this.scaleX);
            const sY = Math.round(this.data.geometry.vertices[edge[0] * 2 + 1] * this.scaleY);
            const tX = Math.round(this.data.geometry.vertices[edge[1] * 2] * this.scaleX);
            const tY = Math.round(this.data.geometry.vertices[edge[1] * 2 + 1] * this.scaleY);
            this.area.moveTo(sX, sY);
            this.area.lineTo(tX, tY);
        });
        if (this.nodes.length !== this.data.geometry.vertices.length * 0.5) {
            this.deleteNodes();
            this.createNodes();
        }
        if (this.nodes.length > 1) {
          const bb = this.bounds;
          const left = Math.round(bb[0] * this.scaleX);
          const top = Math.round(bb[1] * this.scaleY);
          const right = Math.round(bb[2] * this.scaleX);
          const bottom = Math.round(bb[3] * this.scaleY);
          this.area.hitArea = new PIXIRectangle(left, top, right - left, bottom - top);
        }
        this.box.clear();
        this.controls.forEach((n) => n.clear());
        this.nodes.forEach((n) => n.clear());
        for (let i = 0; i < 0.5 * this.data.geometry.vertices.length; i++) {
            const x = this.data.geometry.vertices[i * 2];
            const y = this.data.geometry.vertices[i * 2 + 1];
            const opacity = this.data.geometry.visibles![i] ? 1 : 0.3;
            const fillColor = settings.colorFillType === "order" ? settings.orderedColors[i] : this.hex;
            const borderColor = this.state === 'nodes' ? 0X426eff : this.hex;
            this.nodes[i].clear();
            this.nodes[i].beginFill(fillColor, opacity);
            this.nodes[i].lineStyle(1, borderColor, 1, 0.5, true);
            this.nodes[i].drawCircle(0, 0, settings.radius);
            const parent = this.getHigherParent();
            if (parent) {
                this.nodes[i].scale.x = 1.5 / parent.scale.x;
                this.nodes[i].scale.y = 1.5 / parent.scale.y;
            }
            this.nodes[i].x = Math.round(x * this.scaleX);
            this.nodes[i].y = Math.round(y * this.scaleY);
            this.nodes[i].endFill();
        }
        if (this.state !== 'contour' && this.state !== 'nodes') {
                if (this.state === 'box') {
                    this.nodes.forEach((c) => { c.interactive = false; });
                    this.drawBox();
                }
            } else if (this.state === 'contour' || this.state === 'nodes') {
            this.controls.forEach((c) => { c.interactive = false; });
        } else {
            // this.nodes.forEach((c) => { c.interactive = false; });
            // this.controls.forEach((c) => { c.interactive = false; });
        }
    }

    public pushNode(x: number, y: number) {
      // check no duplicate
      for (const [idx, c] of this.data.geometry.vertices.slice(0, this.data.geometry.vertices.length - 2)
               .entries()) {
        if (idx % 2 === 0 &&
            Math.round(c * this.scaleX) === Math.round(x * this.scaleX)) {
          if (Math.round(this.data.geometry.vertices[idx + 1] * this.scaleY) ===
              Math.round(y * this.scaleY)) {
            console.warn('Same location. Abort.');
            return;
          }
        }
      }
      this.data.geometry.vertices = [...this.data.geometry.vertices, x, y];
      this.data.geometry.visibles = [...this.data.geometry.visibles!, true];
    }
}