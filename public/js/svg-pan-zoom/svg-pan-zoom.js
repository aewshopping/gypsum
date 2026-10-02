/**
 * @file Pan and zoom for an SVG, with its controls laid over it.
 *
 * Ported close to word for word from the world map on popularhistorybooks.com — the original is kept
 * in plans/reference/svg-pan-zoom-original.html. It was tested across desktop, mobile and browsers,
 * so the logic is left as it was and the changes are only the ones a module forces:
 *
 * - elements are found inside the container passed in rather than by id, so two can share a page;
 * - `panzoomstate` is declared, which a module (always strict) requires;
 * - `tpCache` is emptied with `length = 0`, since it is a const;
 * - the pan limit is the far edge — a drag stops only when just a sliver of the drawing is left in
 *   view — where the original stopped at the near edge, which held a zoomed-out drawing still;
 * - a drag's end hands the cursor back to the stylesheet rather than setting `default`, so pan on
 *   shows `move` over the chart before any drag as well as during one;
 * - leaving full screen by Escape unticks the toggle, as the button does — otherwise its icon and the
 *   pan setting stayed as if still full screen;
 * - **the pan-zoom toggle gates the mouse as well as touch.** Off, nothing pans; the press belongs to
 *   whatever is drawn in the SVG. On, a drag pans and nothing in the SVG is pressable.
 *
 * It knows nothing about notes or the app's state, and finds its own controls by class. The caller
 * writes the markup — container, controls and `<svg class="pz-svg">` — the way the original page
 * did, and may hand back the state `readPanZoomState()` took before a re-render replaced it.
 */

const ns = "http://www.w3.org/2000/svg";

/**
 * Where an attached viewer has been zoomed and panned to, read off its DOM before it is replaced.
 *
 * @param {Element|null} container - The element attachPanZoom was given, or anything without one.
 * @returns {{scale: number, x: number, y: number, panzoomon: boolean}|null} null if there is no viewer.
 */
export function readPanZoomState(container) {
  const group = container?.querySelector('.pz-group');
  if (!group) return null;
  return {
    scale: group.transform.baseVal[0].matrix.a,
    x: group.transform.baseVal[1].matrix.e,
    y: group.transform.baseVal[1].matrix.f,
    panzoomon: container.querySelector('.pz-panzoom-check').checked,
  };
}

/**
 * Makes the SVG inside a container pannable and zoomable, and wires up its controls.
 *
 * @param {HTMLElement} container - Holds `svg.pz-svg`, `.pz-fullscreen-check`, `.pz-panzoom-check`,
 *   `.pz-reset` and `input.pz-zoom-input` (a range, whose min and max bound the zoom).
 * @param {{scale: number, x: number, y: number, panzoomon: boolean}|null} [state] - To restore.
 * @returns {void}
 */
export function attachPanZoom(container, state = null) {
// get the svg element we are interested in
var svgroot = container.querySelector('svg.pz-svg'); // to register mouse and touch events, act as a canvas for grabbing oordinates
// create group item to wrap around svg content. We will need this to apply transformations to as can't apply transformations to svg root on ios :-(
const svggroup = document.createElementNS(ns,"g");
svggroup.setAttribute("class","pz-group");
svggroup.setAttribute("transform","scale(1,1) translate(0,0)");
svggroup.setAttribute("transform-origin","50% 50%");
// wrap the the new group around svgroot content
const range = document.createRange();
range.selectNodeContents(svgroot);
range.surroundContents(svggroup);
var svg = svggroup;
var svgcontainer = container;
// get the input range zoom slider and set it to the scale transform applied to the svg + initialise the zoomvalue variable
const zoominput = container.querySelector(".pz-zoom-input");
const initScaleValue = svg.transform.baseVal.getItem(0).matrix.a;
let wheelscale = initScaleValue;
zoominput.value = initScaleValue;
var zoomvalue = initScaleValue;
const zoomvalueMin = zoominput.min;
const zoomvalueMax = zoominput.max;
// get translate and zoom transforms
const transfScale = svg.transform.baseVal[0];
const transfTranslate = svg.transform.baseVal[1];
// Touch Point cache
const tpCache = [];
// variables used later in boundary collision detection
let rectsvg, rectcont;
// if this checkbox is checked allows pan and mousewheel zoom
const panzoomcheck = container.querySelector('.pz-panzoom-check');
var panzoomon = false;
panzoomcheck.addEventListener("input", (event) => {
  if (panzoomcheck.checked == true){
    panzoomon = true;
  } else {
    panzoomon = false;
  }
});
// toggle fullscreen on and off where supported
let fullscreencheck = container.querySelector(".pz-fullscreen-check");
let panzoomstate; // to record state of checkbox
fullscreencheck.addEventListener("input", (event) => {
  toggleFullscreen();
});
// function targets the map container
function toggleFullscreen() {
  let elem = svgcontainer;
  if (!document.fullscreenElement) {    elem.requestFullscreen().catch((err) => {
      console.log(`Error attempting to enable fullscreen mode: ${err.message} (${err.name})`);
    });
    // turn on checkboxes to enable panning and represent full screen
    panzoomstate = panzoomcheck.checked; // record state
    panzoomcheck.checked = true;
    panzoomon = true;    fullscreencheck.checked = true;
  } else {
 document.exitFullscreen();
    // turn off those checkboxes
    fullscreencheck.checked = false;
    if (panzoomstate == false) {
      panzoomcheck.checked = false; //only turn off if was off before
      panzoomon = false;
    }
  }
}
// leaving full screen some other way (Escape) undoes what the button would have: not in the original
svgcontainer.addEventListener("fullscreenchange", (event) => {
  if (!document.fullscreenElement && fullscreencheck.checked) {
    fullscreencheck.checked = false;
    if (panzoomstate == false) {
      panzoomcheck.checked = false;
      panzoomon = false;
    }
  }
});
// add a reset back to initial values option
var mapreset = container.querySelector('.pz-reset');
mapreset.addEventListener("click", (event) => {
// revert to initial scale
transfScale.setScale(initScaleValue, initScaleValue);
// revert to initial translate of zero
transfTranslate.setTranslate(0,0);
 zoominput.value = initScaleValue;
  zoomvalue = initScaleValue;
  wheelscale = initScaleValue;
});
// add slider zoom functionality
zoominput.addEventListener("input", zoominout);
function zoominout(event) {
// get zoom level from input range
  zoomvalue = zoominput.value
transfScale.setScale(zoomvalue,zoomvalue);
  wheelscale = parseInt(zoomvalue); //otherwise not in line with step on zoom range input
}
// add mouse wheel zoom functionality
svgroot.addEventListener("wheel", wheelzoom);
function wheelzoom(evt) {
  if (panzoomon == true) {
    evt.preventDefault();
// change constant for scroll sensitivity
    // only zooming out on Chrome not zooming in, fine on Edge... odd!
    wheelscale += evt.deltaY * -0.01;
    // constrain wheelscale to range input max and min
    wheelscale = Math.min(Math.max(zoominput.min, wheelscale), zoominput.max);
zoominput.value = wheelscale;
zoominout();
  }
}

// put back where a previous render left off: not in the original, which was drawn once
if (state) {
  transfScale.setScale(state.scale, state.scale);
  transfTranslate.setTranslate(state.x, state.y);
  zoominput.value = state.scale;
  zoomvalue = state.scale;
  wheelscale = state.scale;
  panzoomcheck.checked = state.panzoomon;
  panzoomon = state.panzoomon;
}

makeDraggable();

// add draggability to svg - mouse and touch
function makeDraggable(evt) {
  svgroot.addEventListener('mousedown', startDrag);
  svgroot.addEventListener('mousemove', drag);
  svgroot.addEventListener('mouseup', endDrag);
  svgroot.addEventListener('mouseleave', endDrag);
  svgroot.addEventListener('touchstart', startDrag);
  svgroot.addEventListener('touchmove', drag);
  svgroot.addEventListener('touchend', endDrag);
  svgroot.addEventListener('touchcancel', endDrag);
 function getMousePosition(evt) {
    var CTM = svgroot.getScreenCTM(); // translate on this one
    var CTMgrp = svg.getScreenCTM(); // scale on this div
    // needed to extract single touch point for panning
    if (evt.touches) { evt = evt.touches[0]; }
    // turn screen co-ordinates into svg co-ordinates
    return {
        x: (evt.screenX - CTM.e)/ (CTMgrp.a),
        y: (evt.screenY - CTM.f)/ (CTMgrp.d),
        xscr: evt.screenX, // for use in collision detection later
        yscr: evt.screenY,
      };
    }
  var selectedElement, startposition, moveposition, startScale, maxLeft, maxBottom, maxTop, maxRight;
  let dxOld = 0, dyOld = 0;
function startDrag(evt) {
    if (panzoomon == true) {
  if (evt.touches) {
        if (evt.touches.length === 2) {
          evt.preventDefault(); //only want to prevent when pinch zooming, otherwise we stop mouseover event working!
          // stick all the touch points into a cache. Later we will use this to get the start and end point of each touch
          for (let i = 0; i < evt.touches.length; i++) {
            tpCache.push(evt.touches[i]);
          }
        }
      }
      // for later use in pinchzoom function
      startScale = zoomvalue;
      svgroot.style.cursor = "move";
      selectedElement = svg;
      // get initial mouse postion
      startposition = getMousePosition(evt);
      // adjust start position with existing translate values
      startposition.x -= transfTranslate.matrix.e;
      startposition.y -= transfTranslate.matrix.f;
      // set moveposition to null in case a previous moveposition messes things up!
      moveposition = null;
      // get shapes to find edges for boundary detectoin
      rectsvg = svg.getBoundingClientRect();
      rectcont = svgcontainer.getBoundingClientRect();
      // calc the limits of the pan drag. Easier to do this directly with screen units. The limit is the far edge: the drawing may be dragged until only a sliver of it is left inside the container — not the original's near-edge limit, which stopped a zoomed-out drawing smaller than the container from moving at all
      const keepX = Math.min(rectsvg.width, 40);
      const keepY = Math.min(rectsvg.height, 40);
      maxLeft = rectcont.right - rectsvg.left - keepX;
      maxBottom = rectcont.top - rectsvg.bottom + keepY;
      maxRight = rectcont.left - rectsvg.right + keepX;
      maxTop = rectcont.bottom - rectsvg.top - keepY;
    }
  }
  function drag(evt) {
if (selectedElement) {
 if (evt.touches && evt.touches.length>=2) {
// Check this event for 2-touch Move/Pinch/Zoom gesture
          handle_pinch_zoom(evt);
        } else {
// to stop accidentally selecting text, that sort of thing
        evt.preventDefault();
        // get current mouse position
        moveposition = getMousePosition(evt);
        let dx = moveposition.x - startposition.x;
        let dy = moveposition.y - startposition.y;
          // for use in detecting whether border of svg is within border of container - easier to do this using screen units
        let dxscr = moveposition.xscr - startposition.xscr;
        let dyscr = moveposition.yscr - startposition.yscr;
    // limit movement of svg if initial svg shape tries to move beyond the border of the constraining container/ This collision detection is pretty approximate due to zooming. Added margins as a safety measure!
        if (dxscr > maxLeft || dxscr < maxRight)
          {dx = dxOld;} else {dxOld = dx;}
        if (dyscr > maxTop || dyscr < maxBottom)
          {dy = dyOld;} else {dyOld = dy;}
        transfTranslate.setTranslate(dx, dy);
        }
      }
    }
  function handle_pinch_zoom(ev) {
      if (ev.touches.length === 2 && ev.touches.length === 2) {
  // Check if the two target touches are the same ones that started the 2-touch
        const point1 = tpCache.findLastIndex(
          (tp) => tp.identifier === ev.touches[0].identifier,
        );
        const point2 = tpCache.findLastIndex(
          (tp) => tp.identifier === ev.touches[1].identifier,
        );
if (point1 >= 0 && point2 >= 0) {
          const startTouch1 = tpCache[point1];
          const endTouch1 = ev.touches[0];
          const startTouch2 = tpCache[point2];
          const endTouch2 =ev.touches[1];
  // Calculate the distance between the two touch point starts
          const startDiffX = Math.abs(startTouch1.clientX - startTouch2.clientX);
          const startDiffY = Math.abs(startTouch1.clientY - startTouch2.clientY);
          const startDiffHyp = Math.sqrt(startDiffX**2 + startDiffY**2);
// Calculate the distance between the two touch point ends
          const moveDiffX = Math.abs(endTouch1.clientX - endTouch2.clientX);
          const moveDiffY = Math.abs(endTouch1.clientY - endTouch2.clientY);
          const moveDiffHyp = Math.sqrt(moveDiffX**2 + moveDiffY**2);
    // the ratio between the difference at the start of the pinch and at the end of the pinch
          let scaleDiff = moveDiffHyp / startDiffHyp;
let zoomvaluetemp = startScale*scaleDiff; // zoom pre ceiling and floor... then apply max and min
          zoomvalue = Math.min(Math.max(zoomvalueMin, zoomvaluetemp), zoomvalueMax);
 transfScale.setScale(zoomvalue,zoomvalue);
          wheelscale = parseInt(zoomvalue);
          zoominput.value = wheelscale;
        } else {
          // empty tpCache
          tpCache.length = 0;
        }
    }
  }
  function endDrag(evt) {
selectedElement = null;
// reset pointer options
    svgroot.style.cursor = ""; // back to the stylesheet's, which is move while pan is on
  }
}
}
