/**
 * Custom implementation of 2d shapes manager.
 * @copyright CEA-LIST/DIASI/SIALV/LVA (2019)
 * @author CEA-LIST/DIASI/SIALV/LVA <pixano@cea.fr>
 * @license CECILL-C
 */

import { InteractionEvent as PIXIInteractionEvent } from 'pixi.js';
import { Renderer } from './renderer';
import { ObservableSet, observe, unobserve } from '@pixano/core';
import { ShapeData } from './types';
import { Graphic, DrawingCross, CONTROL_POINTS } from './graphics';
import { bounds } from './utils';
import { Controller } from './controller-base';

export class ShapesEditController extends Controller {

	// arguments
	public targetShapes: ObservableSet<ShapeData>;

	public renderer: Renderer;

	public graphics: Set<Graphic>;

	// internal properties
	protected cachedShape: ShapeData | null = null;

	private activeObjectId: string = '';

	private isDragging: boolean = false;

	private isScaling: boolean = false;

	private _changed: boolean = false;

	private initialControlIdx: number = -1;

	private activeControlIdx: number = -1;

	protected previousPos: { x: number, y: number } = { x: 0, y: 0 };

	protected observer: any = null;

	set changed(changed: boolean) {
		this._changed = changed;
		if (changed) {
			const obj = this.getShape(this.activeObjectId);
			if (obj) {
				this.cachedShape = JSON.parse(JSON.stringify(obj));
			}
		} else {
			this.cachedShape = null;
		}
	}

	get changed() {
		return this._changed;
	}

	constructor(props: Partial<ShapesEditController> = {}) {
		super(props);

		this.renderer = props.renderer || new Renderer();
		this.targetShapes = props.targetShapes || new ObservableSet();
		this.graphics = props.graphics || new Set();
		// automatic update shape display
		// triggered on selection object change
		this.observer = (prop: string, value?: any) => {
			switch (prop) {
				case 'set': {
					// clear all drawn selection(s)
					this.graphics.forEach((o) => {
						o.state = 'none';
						this.setShapeInteraction(o);
						o.draw();
					});
					// add new selection(s)
					value = Array.isArray(value) ? value : [value];
					value.forEach((v: ShapeData) => {
						const o = this.getGraphic(v)!;
						o.state = 'box';
						this.setShapeInteraction(o);
						o.draw();
					});
					break;
				}
				case 'add': {
					// add new selection
					value = Array.isArray(value) ? value : [value];
					value.forEach((v: ShapeData) => {
						const o = this.getGraphic(v)!;
						o.state = 'box';
						this.setShapeInteraction(o);
						o.draw();
					});
					break;
				}
				case 'delete': {
					// remove selection
					const o = this.getGraphic(value as ShapeData)!;
					o.state = 'none';
					this.setShapeInteraction(o);
					o.draw();
					break;
				}
				case 'clear': {
					// remove all selection
					this.graphics.forEach((o) => {
						o.state = 'none';
						this.setShapeInteraction(o);
						o.draw();
					});
					break;
				}
			}
		};
		this.bindings();
	}

	protected bindings() {
		// prebind methods
		this.onRootDown = this.onRootDown.bind(this);
		this.onObjectDown = this.onObjectDown.bind(this);
		this.onObjectMove = this.onObjectMove.bind(this);
		this.onObjectUp = this.onObjectUp.bind(this);
	}

	public setShapeInteraction(graphic: Graphic | null = null) {
		if (!graphic) {
			return;
		}

		if (graphic.state === 'box') {
			graphic.controls.forEach((c, idx) => {
				c.removeAllListeners();
				c.on('pointerdown', (evt: any) => {
					// stop bubbling
					evt.stopPropagation();
					evt.idx = idx;
					this.onControlDown(evt, graphic);
				});
			});
		} else if (graphic.state === 'none') {
			graphic.controls.forEach((c) => {
				c.removeAllListeners('pointerdown');
				c.interactive = false;
				c.buttonMode = false;
			});
			graphic.draw();
		}
	}

	public drawDefaultShapesDecoration(graphic: Graphic | null = null) {

		const graphics = graphic ? new Set([graphic]) : this.graphics;
		graphics.forEach((o) => {
			const decorator = !this.targetShapes.has(o.data) ? 'none' :
				this.targetShapes.size > 2 ? 'contour' : 'box';
			o.state = decorator;
			this.setShapeInteraction(o);
			o.draw();
		});
		const sel = this.getFirstGraphic();
		if (sel) {
			this.renderer.bringToFront(sel);
		}
	}

	public activate() {
		observe(this.targetShapes, this.observer);
		// handle update mode for each shape
		this.graphics.forEach((s) => {
			s.interactive = true;
			s.buttonMode = true;
			s.on('pointerdown', this.onObjectDown);
		});
		this.drawDefaultShapesDecoration();
		this.renderer.stage.interactive = true;
		this.renderer.stage.removeListener('pointerdown', this.onRootDown);
		this.renderer.stage.on('pointerdown', this.onRootDown);
	}

	public deactivate() {
		unobserve(this.targetShapes, this.observer);
		this.graphics.forEach((s) => {
			s.state = 'none';
			this.setShapeInteraction(s);
			s.setInteractive(false);
			s.buttonMode = false;
			s.removeAllListeners();
		});
		this.renderer.stage.removeListener('pointerdown', this.onRootDown);
	}

	/**
	 * Handle click on canvas
	 * @param evt
	 */
	public onRootDown(evt: any) {
		if (evt.data.originalEvent.button === 2 || evt.data.originalEvent.button === 1) {
			return;
		}
		if (this.targetShapes.size) {
			this.targetShapes.clear();
			this.emitSelection();
		}
	}

	/**
	 * Handle click on shape
	 */
	onObjectDown(evt: PIXIInteractionEvent) {

		// default behaviour is
		// cancel action if pointer is right or middle
		const button = (evt.data.originalEvent as PointerEvent).button;
		if (button === 2 || button === 1) {
			return;
		}
		const shape = (evt as any).shape as ShapeData;
		const id = shape.id;
		this.previousPos = this.renderer.getPosition(evt.data);
		this.activeObjectId = id;
		this.isDragging = true;
		this.changed = false;
		// direct update of targets
		// should trigger related observer
		const obj = [...this.graphics].find((o) => o.data === shape);
		if (!obj) {
			// no object
			return;
		}
		this.renderer.stage.on('pointermove', this.onObjectMove);
		this.renderer.stage.on('pointerupoutside', this.onObjectUp);
		const changed = this.doObjectSelection(shape, evt.data.originalEvent.shiftKey);
		if (changed) {
			this.emitSelection();
		}
	}

	/**
	 * Change selection based on shift key and box selected.
	 * Return if selection has changed
	 * @param shape
	 * @param isShiftKey
	 */
	doObjectSelection(shape: ShapeData, isShiftKey: boolean = false): boolean {
		const beforeSelection = new Set(this.targetShapes);
		if (isShiftKey) {
			if (!this.targetShapes.has(shape)) {
				this.targetShapes.add(shape);
			} else {
				// remove clicked shape
				this.targetShapes.delete(shape);
			}
		} else if (!this.targetShapes.has(shape)) {
			// add clicked shape
			this.targetShapes.clear();
			this.targetShapes.add(shape);
		}
		return JSON.stringify([...this.targetShapes]) !== JSON.stringify([...beforeSelection]);
	}

	/**
	 * Handle cursor move on object
	 * @param evt
	 */
	public onObjectMove(evt: PIXIInteractionEvent) {
		const shape = (evt as any).shape;
		if ((evt.data.originalEvent as PointerEvent).pressure && this.isDragging && this.targetShapes.has(shape)) {
			const mouse = this.renderer.getPosition(evt.data);
			if (mouse.x === this.previousPos.x && mouse.y === this.previousPos.y) {
				return;
			}
			let dx = (mouse.x - this.previousPos.x) / this.renderer.imageWidth;
			let dy = (mouse.y - this.previousPos.y) / this.renderer.imageHeight;
			const bb = this.globalBounds();
			const dbottom = 1 - bb[3];
			const dtop = bb[1];
			const dright = 1 - bb[2];
			const dleft = bb[0];
			if (!this.renderer.enableOutsideDrawing) {
				dy = Math.min(dbottom, dy);
				dy = Math.max(-dtop, dy);
				dx = Math.min(dright, dx);
				dx = Math.max(-dleft, dx);
			}
			if (dx === 0 && dy === 0) {
				return;
			}
			if (!this.changed) {
				this.changed = true;
			}
			this.targetShapes.forEach(({ geometry }) => {
				geometry.vertices = geometry.vertices
					.map((v, idx) => (idx % 2) ? v + dy : v + dx);
			});
			this.previousPos = mouse;
		}
	}

	onObjectUp(e: PIXIInteractionEvent) {

		this.isDragging = false;
		const obj = this.getGraphic((e as any).shape);
		if (obj) {
			this.renderer.stage.removeListener('pointermove', this.onObjectMove);
			this.renderer.stage.removeListener('pointerupoutside', this.onObjectUp);
			if (this.changed) {
				this.emitUpdate();
			}
		}
	}

	protected emitUpdate() {
		this.emit('update', [...this.targetShapes].map((data) => data.id));
	}

	protected emitSelection() {
		this.emit('selection', [...this.targetShapes].map((data) => data.id));
	}

	protected onControlDown(evt: PIXIInteractionEvent, graphic: Graphic) {
		this.isScaling = true;
		// @ts-ignore
		const idx = evt.idx;
		this.activeControlIdx = idx;
		this.changed = false;
		this.initialControlIdx = idx;
		if (graphic) {
			graphic.controls[this.activeControlIdx].on('pointermove', (e: any) => {
				// stop bubbling
				e.stopPropagation();
				e.idx = this.activeControlIdx;
				this.onControlMove(e);
			});
			graphic.controls[this.activeControlIdx].on('pointerupoutside', (e: any) => {
				// stop bubbling
				e.stopPropagation();
				this.onControlUp(graphic);
			});
		}
	}

	public onControlMove(evt: PIXIInteractionEvent) {
		if (this.isScaling && (evt as any).idx === this.activeControlIdx) {
			if (!this.changed) {
				// this.emit('start-update', this.selectToJson());
				this.changed = true;
			}
			let xMin = 1;
			let xMax = 0;
			let yMin = 1;
			let yMax = 0;
			[xMin, yMin, xMax, yMax] = this.globalBounds();
			const mouseData = this.renderer.getPosition(evt.data);
			let xN = mouseData.x / this.renderer.imageWidth;
			let yN = mouseData.y / this.renderer.imageHeight;
			xN = Math.min(1, Math.max(0, xN));
			yN = Math.min(1, Math.max(0, yN));
			[xMin, yMin, xMax, yMax] = this.globalBounds();
			let rx = 1;
			let ry = 1;
			let anchorX = 1;
			let anchorY = 1;
			let ctrlX = 1;
			let ctrlY = 1;
			if (CONTROL_POINTS[this.activeControlIdx].x !== 0.5) {
				anchorX = xMin + Math.abs(CONTROL_POINTS[this.activeControlIdx].x - 1) * (xMax - xMin);
				ctrlX = xMin + CONTROL_POINTS[this.activeControlIdx].x * (xMax - xMin);
				rx = (xN - anchorX) / (ctrlX - anchorX);
			}
			if (CONTROL_POINTS[this.activeControlIdx].y !== 0.5) {
				anchorY = yMin + Math.abs(CONTROL_POINTS[this.activeControlIdx].y - 1) * (yMax - yMin);
				ctrlY = yMin + CONTROL_POINTS[this.activeControlIdx].y * (yMax - yMin);
				ry = (yN - anchorY) / (ctrlY - anchorY);
			}
			if (rx === 0 || ry === 0) {
				// forbid complete flattening of coordinates
				return;
			}
			if (rx < 0 || ry < 0) {
				// reverse coords order
				if (rx <= 0) {
					this.activeControlIdx = CONTROL_POINTS.findIndex((c) => c.y === CONTROL_POINTS[this.activeControlIdx].y &&
						c.x === Math.abs(CONTROL_POINTS[this.activeControlIdx].x - 1));
				}
				if (ry <= 0) {
					this.activeControlIdx = CONTROL_POINTS.findIndex((c) => c.x === CONTROL_POINTS[this.activeControlIdx].x &&
						c.y === Math.abs(CONTROL_POINTS[this.activeControlIdx].y - 1));
				}
			}
			this.targetShapes.forEach((data) => {
				if (rx < 0 || ry < 0) {
					// reverse coords order
					const coords = data.geometry.vertices;
					let ch: number[] = [];
					for (let index = coords.length - 2; index >= 0; index -= 2) {
						const x = (rx < 0) ? coords[index] : coords[coords.length - 2 - index];
						const y = (ry < 0) ? coords[index + 1] : coords[coords.length - 1 - index]
						ch = ch.concat([x, y]);
					}
					data.geometry.vertices = ch;
				}
				data.geometry.vertices = [...data.geometry.vertices.map((c, idx) => {
					if (idx % 2 === 0 && rx !== 1) {
						return (c - anchorX) * rx + anchorX;
					} else if (idx % 2 === 1 && ry !== 1) {
						return (c - anchorY) * ry + anchorY;
					} else {
						return c;
					}
				})];
			});

		}
	}

	public onControlUp(graphic: Graphic) {
		if (this.initialControlIdx !== -1) {
			if (graphic) {
				graphic.controls[this.initialControlIdx].removeAllListeners('pointermove');
				graphic.controls[this.initialControlIdx].removeAllListeners('pointerupoutside');
				this.isScaling = false;
				this.activeControlIdx = -1;
				this.initialControlIdx = -1;
				if (this.changed) {
					this.changed = false;
					this.emitUpdate();
				}
			}
		}
	}

	/**
	 * Get global bounds of multiple shapes.
	 */
	protected globalBounds() {
		let xMin = 1;
		let yMin = 1;
		let xMax = 0;
		let yMax = 0;
		this.targetShapes.forEach((data) => {
			const bb = bounds(data.geometry.vertices);
			if (bb[0] < xMin) { xMin = bb[0]; }
			if (bb[2] > xMax) { xMax = bb[2]; }
			if (bb[1] < yMin) { yMin = bb[1]; }
			if (bb[3] > yMax) { yMax = bb[3]; }
		});
		return [xMin, yMin, xMax, yMax];
	}

	/**
	 * Retrieve graphical shape for a given shape data
	 * @param s
	 */
	protected getGraphic(s: ShapeData) {
		let graphic = [...this.graphics].find((o) => o.data === s);
		if (!graphic) {
			// find graphic with required id
			graphic = [...this.graphics].find((o) => o.data.id === s.id);
		}
		return graphic;
	}

	protected getFirstGraphic() {
		const s = this.targetShapes.values().next().value;
		if (s) {
			return [...this.graphics].find((o) => o.data === s);
		}
		return null;
	}

	protected getShape(id: string) {
		return [...this.targetShapes].find((s) => s.id === id);
	}
}

/**
 * Base class for shape creation:
 * Displays a cross around cursor for better precision.
 */
export abstract class ShapeCreateController extends Controller {

	// arguments
	public renderer: Renderer;

	public _shapes: ObservableSet<ShapeData>;

	public targetShapes: ObservableSet<ShapeData>;

	public graphics: Set<Graphic>;

	// internal properties
	protected cross: DrawingCross = new DrawingCross();

	// temporary shape used to draw the graphic
	protected tmpShape: Graphic | null = null;

	protected isCreating: boolean = false;

	protected mouse: { x: number, y: number } = { x: 0, y: 0 };

	protected observer: any = null;

	readonly id: string = Math.random().toString(36).substring(2);

	private onImageSizeChange: () => void;

	constructor(props: Partial<ShapeCreateController> = {}) {
		super(props);
		this.renderer = props.renderer || new Renderer();
		this._shapes = props._shapes || new ObservableSet();
		this.targetShapes = props.targetShapes || new ObservableSet();
		this.graphics = props.graphics || new Set();
		this.renderer.stage.addChild(this.cross);
		this.observer = () => {
			this.graphics.forEach((o) => {
				o.state = this.getShape(o.data.id) ? 'contour' : 'none';
				o.draw();
			});
		};
		this.bindings();
		this.onImageSizeChange = () => {
			const p = this.renderer.mouse;
			this.cross.cx = p.x;
			this.cross.cy = p.y;
			this.cross.scaleX = this.renderer.imageWidth;
			this.cross.scaleY = this.renderer.imageHeight;
			this.cross.draw();
		}
	}

	protected bindings() {
		// prebind methods
		this.onRootMove = this.onRootMove.bind(this);
		this.onRootDown = this.onRootDown.bind(this);
		this.onRootUp = this.onRootUp.bind(this);
	}

	public activate() {
		observe(this.targetShapes, this.observer);
		this.cross.visible = true;
		const pos = this.renderer.mouse;
		this.cross.cx = pos.x;
		this.cross.cy = pos.y;
		this.cross.scaleX = this.renderer.imageWidth;
		this.cross.scaleY = this.renderer.imageHeight;
		this.cross.draw();
		this.renderer.stage.on('pointerdown', this.onRootDown);
		this.renderer.stage.on('pointermove', this.onRootMove);
		this.renderer.stage.on('pointerupoutside', this.onRootUp);
		this.renderer.addEventListener('resize', this.onImageSizeChange);

	}

	public deactivate() {
		unobserve(this.targetShapes, this.observer);
		this.cross.visible = false;
		const shape = this.tmpShape as Graphic;
		if (shape) {
			this.renderer.stage.removeChild(shape);
			shape.destroy();
			this.tmpShape = null;
		}
		this.renderer.stage.removeListener('pointerdown', this.onRootDown);
		this.renderer.stage.removeListener('pointermove', this.onRootMove);
		this.renderer.stage.removeListener('pointerupoutside', this.onRootUp);
		this.renderer.removeEventListener('resize', this.onImageSizeChange);
	}

	protected emitCreate() {
		const newShape = [...this._shapes].pop();
		this.targetShapes.set([newShape!]);
		this.emit('create', newShape);
	}

	protected emitSelection() {
		this.emit('selection', [...this.targetShapes].map((data) => data.id));
	}

	protected emitUpdate() {
		this.dispatchEvent(new Event('update'));
	}

	protected abstract onRootDown(evt: PIXIInteractionEvent): void;

	onRootMove(evt: PIXIInteractionEvent) {
		const pointer = (evt.data.originalEvent as PointerEvent);
		if (pointer.buttons === 2 || pointer.buttons === 4) {
			return;
		}
		const mouse = this.renderer.getPosition(evt.data);
		if (mouse.x === this.cross.cx && mouse.y === this.cross.cy) {
			return;
		}
		this.cross.scaleX = this.renderer.imageWidth;
		this.cross.scaleY = this.renderer.imageHeight;
		this.cross.cx = mouse.x;
		this.cross.cy = mouse.y;
		this.cross.draw();
		// const pt2 = this.renderer.toAbsolutePosition(mouse.x, mouse.y);
		// this.renderer.moveBubble(pt2.x, pt2.y);
	}

	protected onRootUp() {
		// Implement your own onRootUp method when inheriting.
	};

	/**
	 * Retrieve graphical shape for a given shape data
	 * @param s
	 */
	protected getGraphic(s: ShapeData) {
		let graphic = [...this.graphics].find((o) => o.data === s);
		if (!graphic) {
			// find graphic with required id
			graphic = [...this.graphics].find((o) => o.data.id === s.id);
		}
		return graphic;
	}

	protected getShape(id: string) {
		return [...this.targetShapes].find((s) => s.id === id);
	}
}
