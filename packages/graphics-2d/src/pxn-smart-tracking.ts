/**
 * Implementation of tracking plugin.
 * @copyright CEA-LIST/DIASI/SIALV/LVA (2020)
 * @author CEA-LIST/DIASI/SIALV/LVA <pixano@cea.fr>
 * @license CECILL-C
 */

import { customElement, html, property} from 'lit-element';
import { Tracking } from './pxn-tracking'
import { Tracker } from '@pixano/ai/lib/tracker';
import '@material/mwc-switch';



@customElement('pxn-smart-tracking' as any)
export class SmartTracking extends Tracking {

	// smart tracker
	private tracker = new Tracker();

	@property({type: Boolean})
	public isTrackTillTheEndChecked: boolean = true;

	@property({type: String})
	public model: string = 'https://raw.githubusercontent.com/pixano/pixano.github.io/master/models/track_model/model.json';

	constructor() {
		super();
		// events specific to smart-tracking
		window.addEventListener('keydown', (evt) => {
			if (evt.key === 't') {
				console.log("start tracking");
				if (this.isTrackTillTheEndChecked) this.trackTillTheEnd();
				else this.trackTillNextFrame();
			}
		});
	}

	updated(changedProperties: any) {
		super.updated(changedProperties);
		if (changedProperties.has('model')) {
			// load the model
			this.tracker.loadModel(this.model).then(() => console.info('Model loaded'));
		}
	}

	protected delay(ms: number) {
		return new Promise(function (resolve) { return setTimeout(resolve, ms); });
	};

	async trackTillTheEnd() {
		var stopTracking = false;
		var stopTrackingListenerFct = function stopTrackingListener (evt: KeyboardEvent) {
			if (evt.key === 'Escape') {
				console.log("stop tracking and get back to edit mode")
				stopTracking = true;
			}
		}
		window.addEventListener('keydown', stopTrackingListenerFct);
		while(!stopTracking && !this.isLastFrame()) {
			await this.trackTillNextFrame();
			await this.delay(100);
		}
		this.mode = 'edit';//back to edit mode after each new creation

		window.removeEventListener('keydown', stopTrackingListenerFct);
	}

	protected trackTillNextFrame() {
		return new Promise((resolve) => {
			/// process the selected shape
			if (this.targetShapes.size>1) {
				console.log("ABORT: we can only track one shape at a time")
				return;
			}
			const target = this.targetShapes.values().next().value;
			/// get the shape to track
			const v: number[] = target.geometry.vertices;
			const xmin = Math.min(v[0], v[2]);
			const xmax = Math.max(v[0], v[2]);
			const ymin = Math.min(v[1], v[3]);
			const ymax = Math.max(v[1], v[3]);
			const x = Math.round(xmin*this.renderer.imageWidth);
			const y = Math.round(ymin*this.renderer.imageHeight);
			const w = Math.round(xmax*this.renderer.imageWidth) - x;
			const h = Math.round(ymax*this.renderer.imageHeight) - y;
			/// pre-processing
			const im0 = this.renderer.image;
			this.tracker.initBox(im0, x, y, w, h);
			/// processing
			this.nextFrame().then(() => {
				const im1 = this.renderer.image;
				var res = this.tracker.run(im1);
				/// get calculated shape and take it as the new shape
				// console.log("res=",res)
				const target = this.targetShapes.values().next().value;
				target.geometry.vertices = [
					res[0]/this.renderer.imageWidth,
					res[1]/this.renderer.imageHeight,
					(res[0]+res[2])/this.renderer.imageWidth,
					(res[1]+res[3])/this.renderer.imageHeight
				]
				this.dispatchEvent(new Event('update'));
			}).then(() => {
				// resolve only after resolving the run
				resolve("Hello ");
			});
		});
	}

	// overide leftPanel to add tracking properties
	get leftPanel() {
		const checked = this.isTrackTillTheEndChecked;
		return html`
		<div flexDirection: 'row'>
			${super.leftPanel}
			<div class="card">
				<p>Continuous tracking
				<mwc-switch ?checked=${checked}
								title="track ones / track till the end (escape to stop tracking)"
								@change=${ () => { this.isTrackTillTheEndChecked = !this.isTrackTillTheEndChecked; } }
								></mwc-switch></p>
			</div>
		</div>
		`;
	}
}
