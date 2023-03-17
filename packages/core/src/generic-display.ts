/**
 * @copyright CEA-LIST/DIASI/SIALV/LVA (2019)
 * @author CEA-LIST/DIASI/SIALV/LVA <pixano@cea.fr>
 * @license CECILL-C
 */

import {LitElement, html} from 'lit';
import {property} from 'lit/decorators.js';
import './playback-control';
import './sequence-timeline';
import { SequenceLoader, Loader } from './data-loader';
import { genericStyles } from './style';


/**
 * Utility class to load images or sequences of images given
 * their sources.
 *
 * @fires CustomEvent#load upon loading input item { detail: input data }
 * @fires CustomEvent#timestamp upon changing current timestamp { detail: number }
 */
export abstract class GenericDisplay extends LitElement {

	public loader: Loader | SequenceLoader = new Loader();

	// additionnal properties for ai
	private _isAIcomponent: boolean = false;
	@property()
	public pendingModelLoad: boolean | null = null;

	protected authorizedType: 'image' | 'pcl' | 'all' = 'all';

	static get properties() {
		return {
			maxFrameIdx: { type: Number }
		};
	}

	// additionnal getter/setter for ai
	get isSmartComponent() { return this._isAIcomponent; }
	set isSmartComponent(is: boolean) {
		if (is) {
			this._isAIcomponent = true;
			this.pendingModelLoad = true;
		} else this._isAIcomponent = false;
	}

	/**
	 * Returns video playback slider element.
	 */
	get playback() {
		return this.shadowRoot?.querySelector('playback-control');
	}
	/**
	 * Returns the timeline element.
	 */
	get timeLine() {
		return this.shadowRoot?.querySelector('pxn-sequence-timeline');
	}

	public static get styles() {
		return [genericStyles];
	}

	constructor() {
		super();
		this.onSliderChange = this.onSliderChange.bind(this);
	}

	protected firstUpdated() {
		const slot = this.shadowRoot?.querySelector('slot')!;
		slot.addEventListener('slotchange', () => {
			// let nodes = slot.assignedNodes();
			this.playback!.disconnectedCallback();
		});
	}

	/******************* INPUT management *******************/

	private _source: string | string[] = '';

	@property({ type: String })
	get input(): string | string[] {
		return this._source;
	}

	/**
	 * Load data from source file or sequence of files
	 * @param {string | string[]} source - media file name or list of media file names
	 */
	set input(source: string | string[]) {
		this._source = source;

		// case of unique data file
		if (typeof source === 'string') {
			this.loader = new Loader(this.authorizedType);
			this.loader.load(source).then((data) => {
				this.notifyInputLoaded(data);
			});
		} else {
			// list of strings
			const loader = new SequenceLoader(this.authorizedType);
			const regex = /(?<=_)(\d+?)(?=\.)/g;
			this.loader = loader;
			const frames = this.timestampRule === 'index' ? source.map((path, timestamp) => ({ timestamp, path })) || [] :
				source.map((path) => {
					const match = path.match(regex);
					const timestamp = match && match.length ? parseInt(match.pop()!,10) : 0;
					return { path, timestamp }
				});
			loader.init(frames)
				.then((length) => {
					this.maxFrameIdx = Math.max(length - 1, 0);
					if (this.playback) {
						this.playback.set(0);
					} else {
						this.frameIdx = 0;
					}
				});
		}
		this.requestUpdate();
	}

	get isSequence() {
		return this.loader instanceof SequenceLoader;
	}

	/******************* Sequences management : timestamp, frame index, navigation *******************/

	// additionnal properties for sequence loader
	public maxFrameIdx: number | null = null;
	public pendingLoad: boolean | null = null;

	@property()
	private _targetFrameIdx: number | null = null;

	private _lastTargetFrameIdx: number | null = null;

	// either use list item index as timestamp
	// or look for timestamp value in filename
	@property({ type: String })
	public timestampRule: 'index' | 'filename' = 'index';// TODO : not used

	get timestamp(): number {
		return this.isSequence ? (this.loader as SequenceLoader).frames[this.frameIdx].timestamp : 0;
	}

	set timestamp(timestamp: number) {
		if (this.isSequence) {
			const frameIdx = (this.loader as SequenceLoader).frames.findIndex((f) => f.timestamp === timestamp);
			if (frameIdx !== -1) {
				this.frameIdx = frameIdx;
			}
		}
	}

	/**
	 * Get frame index
	 */
	get frameIdx(): number {
		return this._targetFrameIdx || 0;
	}

	/**
	 * Set frame to load
	 * @param {number} frameIndex - index of frame to load
	 */
	set frameIdx(frameIndex: number) {
		if (!this.isSequence) {
			return;
		}
		const maxFrameIdx = this.maxFrameIdx as number;
		const loader = this.loader as SequenceLoader;
		if (frameIndex >= 0 && frameIndex <= maxFrameIdx && this._targetFrameIdx !== frameIndex) {// don't notify if nothing changes
			this._lastTargetFrameIdx = this._targetFrameIdx;// keep the last state
			this._targetFrameIdx = frameIndex;
			this.playback!.current = frameIndex;
			if (this.pendingLoad) {
				return;
			}
			this.pendingLoad = true;
			loader.peekFrame(this._targetFrameIdx).then((data: any) => {
				this.pendingLoad = false;
				this.notifyInputLoaded(data);
				this.notifyTimestampChanged();
			});
		}
	}

	/**
	 * Get last frame index
	 */
	get lastFrameIdx(): number {
		return this._lastTargetFrameIdx || 0;
	}

	public prevFrame(): Promise<void> {
		return new Promise((resolve) => {
			if (!this.isSequence) {
				resolve();
			}
			const obs = () => {
				this.removeEventListener('load', obs);
				resolve();
			}
			this.addEventListener('load', obs);
			if (this.playback) {
				this.playback.setBefore();
			} else {
				const currIdx = this._targetFrameIdx as number;
				if (currIdx > 0) {
					this.frameIdx = currIdx - 1;
				}
			}
		});
	}

	public nextFrame(): Promise<void> {
		return new Promise((resolve) => {
			if (!this.isSequence) {
				resolve();
			}
			const obs = () => {
				this.removeEventListener('load', obs);
				resolve();
			}
			this.addEventListener('load', obs);
			if (this.playback) {
				this.playback.setNext();
			} else {
				const currIdx = this._targetFrameIdx as number;
				const maxIdx = this.maxFrameIdx as number;
				if (currIdx < maxIdx) {
					this.frameIdx = currIdx + 1;
				}
			}
		});
	}

	public isLastFrame(): boolean {
		const currIdx = this._targetFrameIdx as number;
		const maxIdx = this.maxFrameIdx as number;
		if (currIdx >= maxIdx) return true;
		return false;
	}

	/******************* EVENTS handlers *******************/

	/**
	 * Fired on playback slider update.
	 * @param {CustomEvent} evt
	 */
	onSliderChange(evt: CustomEvent) {
		this.frameIdx = evt.detail;
	}

	onTimelineClick(evt: CustomEvent) {
		// 1) go to selected frame
		this.frameIdx = evt.detail.frame;
		// 2) select the corresponding shape
		console.log("select id ",[evt.detail.id]);
		console.log("we have to implement a generic slect function in generic-display and call it from here");//TODO
		// this.select([evt.detail.id]);//TODO : make it generic
	}

	private notifyInputLoaded(data: HTMLImageElement | Float32Array) {
		this.dispatchEvent(new CustomEvent('load', { detail: data }));
	}

	private notifyTimestampChanged() {
		this.dispatchEvent(new CustomEvent('timestamp', { detail: this._targetFrameIdx }));
	}

	/******************* RENDERING  *******************/

	display() {
		return html``;
	}

	pendingModelLoadScreen() {
		return html`${this.pendingModelLoad
			? html`
				<div style="position: absolute; top: 0;	left: 0; opacity: 0.5; background: white; width: 100%; height: 100%; cursor: wait;">
					<h1 style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)">
						Smart tool model is loading, please wait...
					</h1>
				</div>`
			: html``}`;
	}
	/**
	 * Generic render that display a playback slider at the bottom
	 * if the component displays a sequence.
	 * You can override the default "slider" slot by your own html child. E.g:
	 * `
	 * 	<pxn-cuboid>
	 * 		<div slot="slider">Slider</div>
	 * 	</pxn-cuboid>
	 * `
	 */
	render() {
		return html`
			<div id="container" tabIndex="1">
				${this.display()}
				${this.pendingModelLoadScreen()}
				<slot name="slider" id="slot">
					${this.sequenceControl}
				</slot>
			</div>
			`;
	}

	get sequenceControl() {
		if (this.isSequence) return html`
				<pxn-sequence-timeline @clickOnData=${this.onTimelineClick} ></pxn-sequence-timeline>
				<playback-control @update=${this.onSliderChange} max=${this.maxFrameIdx}></playback-control>
			`;
		else return html``;
	}
}
