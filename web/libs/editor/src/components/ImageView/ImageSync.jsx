import React, { Component } from 'react';
import { observer } from "mobx-react";
import { Block } from "../../utils/bem";
import { parseValue } from "../../utils/data";
import debounce from 'lodash/debounce';
import './ImageSync.css'; 

const PAN_PXLS = 30;
const MIN_VISIBLE_RATIO = 0.01;
const POLL_INTERVAL_MS = 300;

class ImageSyncComponent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      // Image State:
      scale: 1,
      position: [0, 0],
      minZoom: 0.5,
      maxZoom: 10,
      imagesFitted: false,

      // Component State
      isDragging: false,
      lastMousePosition: [0, 0],
      controlsVisible: false,


      // UI State:
      choices: [],
    };
    this.containerRef = React.createRef();
    this.imageRefs = [React.createRef(), React.createRef(), React.createRef()];
    
    // FIXME: temp solution uses a timer to determine when the state of the checkboxes change. 
    // For future, it would be useful to modify the props.store coming into this component so that it can recieve that info directly from the view.
    this.pollInterval = null; 
    this.mouseLeaveTimer = null;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.getMousePositionOnImage = this.getMousePositionOnImage.bind(this);
    // console.log("Props:", props);
    // console.log("Task:", props.store.task);
    // console.log("Annotation Store:", JSON.stringify(props.store.annotationStore, null, 4))
    // console.log("Annotations:", JSON.stringify(props.store.annotationStore.annotations, null, 4));
  }


  /////////////////////////////////////
  // INITALIZATION METHODS ///////////
  ///////////////////////////////////

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('mousemove', this.handleMouseMove);
    this.containerRef.current.addEventListener('wheel', this.handleWheel, { passive: false });
    this.fitImagesToColumns();
    this.startPolling();
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('mousemove', this.handleMouseMove);
    this.containerRef.current.removeEventListener('wheel', this.handleWheel);
    this.stopPolling();
  }

  addWheelListeners() {
    this.imageRefs.forEach(ref => {
      if (ref.current) {
        ref.current.addEventListener('wheel', this.handleWheel, { passive: false });
      }
    });
  }

  removeWheelListeners() {
    this.imageRefs.forEach(ref => {
      if (ref.current) {
        ref.current.removeEventListener('wheel', this.handleWheel);
      }
    });
  }

  startPolling = () => {
    this.pollInterval = setInterval(this.updateChoices, POLL_INTERVAL_MS); // Check every 500ms
  }

  stopPolling = () => {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }


  ///////////////////////////////
  // HANDLER METHODS ///////////
  ////////////////////////////

  handleResize = () => {
    this.fitImagesToColumns();
  }

  handleCheckboxChange(event) {
    if (event.target.matches('.lsf-choices input[type="checkbox"]')) {
      console.log('Change event detected', event.target);
      this.updateChoices();
    }
  }

  handleImageDoubleClick = (index) => {
    this.simulateKeyPress(index + 1);
  }

  handleKeyDown(e) {
    if (e.ctrlKey) {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        this.handleZoomOut();
      }
      else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.handleReset();
      }
    } else {

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          this.handleKeyPan(0, PAN_PXLS / this.state.scale);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.handleKeyPan(0, -PAN_PXLS / this.state.scale);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.handleKeyPan(PAN_PXLS / this.state.scale, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.handleKeyPan(-PAN_PXLS / this.state.scale, 0);
          break;
        default:
          break;
      }
    }
  }

  handleWheel(e) {
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY * -0.001;
    const newScale = Math.max(this.state.minZoom, Math.min(this.state.scale * (1 + delta), this.state.maxZoom));
    
    const rect = this.containerRef.current.getBoundingClientRect();

    const imageContainer = event.target.closest('[data-image-index]');
  
    if (!imageContainer) {
      return;
    }
    const imageIndex = parseInt(imageContainer.getAttribute('data-image-index'), 10);
    // console.log('Mouse is over image:', imageIndex);

    // Get mouse position for the current image
    const position = this.getMousePositionOnImage(event, imageIndex);
    // console.log('Mouse position:', position);

    this.setState(prevState => ({
      scale: newScale
    }));
  }

  handleZoomIn = () => {
    this.setState(prevState => ({
      scale: Math.min(this.state.maxZoom, prevState.scale * 1.2)
    }));
  };

  handleZoomOut = () => {
    this.setState(prevState => ({
      scale: Math.max(this.state.minZoom, prevState.scale / 1.2)
    }));
  }
  
  handleZoomChange = (e) => {
    const newScale = parseFloat(e.target.value);
    this.setState({ scale: newScale });
  }

  handleKeyPan = (deltaX, deltaY) => {
    this.setState(prevState => ({
      position: this.constrainPosition(prevState.position[0] + deltaX * prevState.scale, prevState.position[1] + deltaY * prevState.scale, prevState.scale)
    }));
  };

  handleMouseDown = (e) => {
    e.preventDefault();
    this.setState({
      isDragging: true,
      lastMousePosition: [e.clientX, e.clientY]
    });
  }

  handleMouseUp = () => {
    this.setState({ isDragging: false });
  }

  handleMouseMove = (e) => {
    if (this.state.isDragging) {
      const deltaX = e.clientX - this.state.lastMousePosition[0];
      const deltaY = e.clientY - this.state.lastMousePosition[1];

      this.setState(prevState => ({
        position: this.constrainPosition(prevState.position[0] + (deltaX / prevState.scale), prevState.position[1] + (deltaY /  prevState.scale), prevState.scale),
        lastMousePosition: [e.clientX, e.clientY]
      }));
    }
    else {
      const { clientY } = event;
      const { innerHeight } = window;
      const threshold = innerHeight - 300; // Show controls when mouse is within 300px of the bottom

      if (clientY > threshold && !this.state.controlsVisible) {
        this.showControls();
      } 
      else if (clientY <= threshold && this.state.controlsVisible) {
        this.hideControls();
      }
    }
  }

  handleReset = () => {
    this.fitImagesToColumns();
  }

  handleZoomChange = (e) => {
    const newScale = parseFloat(e.target.value);
    this.setState({ scale: newScale });
  }
  
  //////////////////////////////////
  // FUNCTIONAL METHODS ///////////
  ///////////////////////////////

  constrainPosition(x, y, scale) {
    const imageContainer = event.target.closest('[data-image-index]');
    let {width, height} = {width: 0, height: 0};
    if (!imageContainer) {
      const image = document.querySelector(`.synced-image-0`);
      width = image.width;
      height = image.height;
    }
    else {
      const imageIndex = parseInt(imageContainer.getAttribute('data-image-index'), 10);
      const image = document.querySelector(`.synced-image-${imageIndex}`);
      width = image.width;
      height = image.height;
    }
    
    const containerRect = this.containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width / 3; // Assuming 3 columns
    const containerHeight = containerRect.height;

    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    const minVisibleWidth = containerWidth * MIN_VISIBLE_RATIO;
    const minVisibleHeight = containerHeight * MIN_VISIBLE_RATIO;

    const maxX = Math.max(0, (scaledWidth - minVisibleWidth) / 2);
    const maxY = Math.max(0, (scaledHeight - minVisibleHeight) / 2);

    return [
      Math.max(-maxX, Math.min(maxX, x)),
      Math.max(-maxY, Math.min(maxY, y))
    ];
  }

  simulateKeyPress = (key) => {
    const event = new KeyboardEvent('keydown', {
      key: key.toString(),
      keyCode: key + 48, // ASCII code for '1' is 49, '2' is 50, '3' is 51
      which: key + 48,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);
  }
  
  fitImagesToColumns = () => {
    const containerWidth = this.containerRef.current.clientWidth / 3; // Assuming 3 columns
    const images = document.querySelectorAll('.synced-image');
    
    images.forEach(img => {
      const aspectRatio = img.naturalWidth / img.naturalHeight;
      const newHeight = containerWidth / aspectRatio;
      
      img.style.width = `${containerWidth}px`;
      img.style.height = `${newHeight}px`;
    });

    this.setState({ scale: 1, position: [0, 0], imagesFitted: true });
  }

  updateAllTransforms = () => {
    // Update the transform of all images based on the new scale and position
    const { scale, position } = this.state;
    const transform = `scale(${scale}) translate(${position[0]}px, ${position[1]}px)`;
    
    this.imageRefs.forEach(ref => {
      if (ref.current) {
        ref.current.style.transform = transform;
      }
    });
  }

  updateChoices = () => {
    const choicesContainer = document.querySelector('.lsf-choices');
    if (choicesContainer) {
      const newChoices = Array.from(choicesContainer.children).map(choice => {
        const checkbox = choice.querySelector('input[type="checkbox"]');
        return checkbox ? checkbox.checked : false;
      });

      // Only update state if choices have changed
      if (JSON.stringify(newChoices) !== JSON.stringify(this.state.choices)) {
        this.setState({ choices: newChoices });
      }
    }
  }

  
  showControls = () => {
    console.log("SHOW CONTROLS");
    this.setState({ controlsVisible: true });
    if (this.mouseLeaveTimer) {
      clearTimeout(this.mouseLeaveTimer);
      this.mouseLeaveTimer = null;
    }
  }

  hideControls = () => {
    console.log("HIDE CONTROLS");
    this.mouseLeaveTimer = setTimeout(() => {
      this.setState({ controlsVisible: false });
    }, 2000); // Hide controls after 2 seconds
  }

  //////////////////////////////
  // GETTER METHODS ///////////
  ////////////////////////////
  
  getImageDimensions = () => {
    const img = this.containerRef?.querySelector('img');
    if (img) {
      return {
        width: img.width,
        height: img.height,
      };
    }
    return { width: 1, height: 1 };
  }

  calculateFramePercentage(scale, imageIndex) {
    const container = document.querySelector('.imagesync-images-container');
    if (!container) return '100%';

    const w_c = container.clientWidth / 3; // Column width (divide by 3 for the three columns)
    const h_c = container.clientHeight; // Column height

    console.log(`Column dimensions: ${w_c}x${h_c}`);

    const image = this.imageRefs[imageIndex].current;
    if (!image) {
        console.log('Image not found, returning 100%');
        return '100%';
    }

    const true_w_i = image.naturalWidth;
    let w_i = w_c * scale;

    // Calculate the number of true pixels in the visible area
    const visibleWidth = Math.min(w_i, w_c);
    
    const zoomScale = (visibleWidth * scale) / true_w_i;

    // Convert zoom scale to percentage
    const percentage = (zoomScale * 100).toFixed(2);

    console.log(`Zoom scale: ${zoomScale}`);
    console.log(`Percentage: ${percentage}%`);

    return `${percentage}%`;
  }


  getMousePositionOnImage = (event, imageIndex) => {
    const { scale, position } = this.state;
    const image = document.querySelector(`.synced-image-${imageIndex}`);
    const container = image.parentElement;
  
    // Get the bounding rectangles
    const containerRect = container.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
  
    // Calculate the actual image dimensions considering the scale
    const actualImageWidth = imageRect.width / scale;
    const actualImageHeight = imageRect.height / scale;
  
    // Calculate the offset of the image within the container
    const imageOffsetX = (containerRect.width - actualImageWidth) / 2;
    const imageOffsetY = (containerRect.height - actualImageHeight) / 2;
  
    // Calculate the mouse position relative to the image
    let x = (event.clientX - containerRect.left - imageOffsetX - position[0]) / scale;
    let y = (event.clientY - containerRect.top - imageOffsetY - position[1]) / scale;
  
    // Ensure the coordinates are within the image bounds
    x = Math.max(0, Math.min(x, image.naturalWidth));
    y = Math.max(0, Math.min(y, image.naturalHeight));
  
    return { x: Math.round(x), y: Math.round(y) };
  }

  getCurrentSelectionFromAnnotations() {
    const { store } = this.props;
    if (store && store.annotationStore && store.annotationStore.annotations) {
      const annotations = store.annotationStore.annotations;
      if (annotations.length > 0) {
        const areas = annotations[0].trackedState.areas;
        const areaKey = Object.keys(areas)[0];
        if (areas[areaKey] && areas[areaKey].results) {
          const result = areas[areaKey].results.find(r => r.from_name === "model_selected");
          if (result && result.value && result.value.choices) {
            const choice = result.value.choices[0];
            return parseInt(choice.split('/')[0]);
          }
        }
      }
    }
    return null;
  }

  getImageSource = (imageName) => {
    const { item, store } = this.props;
    return parseValue(item[imageName], store.task.dataObj);
  }


  ////////////////////////////////
  // VISUAL INTERFACE ///////////
  //////////////////////////////

  // renderImage = (src, index) => {
  //   const { scale, position } = this.state;
  //   const transform = `scale(${scale}) translate(${position[0]}px, ${position[1]}px)`;

  //   return (
  //     <div 
  //       style={{ 
  //         width: '100%', 
  //         paddingBottom: '50%', 
  //         position: 'relative', 
  //         overflow: 'hidden',
  //         minHeight: '100vh' 
  //       }}
  //       onDoubleClick={() => this.handleImageDoubleClick(index)}
  //     >
  //       <img
  //         alt={`synced image ${index}`}
  //         ref={this.imageRefs[index]}
  //         src={src}
  //         className={`imagesync-image synced-image-${index}`}
  //         style={{
  //           transform: transform,
  //         }}
  //       />
  //     </div>
  //   );
  // }

  renderImage = (src, index) => {
    const { scale, position } = this.state;
    const transform = `scale(${scale}) translate(${position[0]}px, ${position[1]}px)`;

    return (
        <img
          alt={`synced image ${index}`}
          ref={this.imageRefs[index]}
          src={src}
          className={`imagesync-image synced-image-${index}`}
          style={{
            transform: transform,
          }}
        />
    );
  }

  render() {
    const { item } = this.props;
    const { scale, minZoom, maxZoom, choices, controlsVisible } = this.state;

    return (
      <Block 
        name="imagesync" 
        tabIndex={0}
        ref={this.containerRef}
        onMouseMove={this.handleMouseMove}
      >
        <div className="imagesync-images-container">
          {['Reference Image:', 'Enhanced 1:', 'Enhanced 2:'].map((title, index) => (
            <div 
              key={index}
              data-image-index={index} 
              onWheel={this.handleWheel}
              onMouseDown={this.handleMouseDown}
              className="imagesync-image-column"
              data-selected={choices[index]}
              style={{
                backgroundColor: choices[index] ? 'rgba(243, 22, 22, 0.4)' : 'transparent',
              }}
            >
              <h3 className="imagesync-title">
                  {title} 
                  <span className="imagesync-frame-percentage">
                      ({this.calculateFramePercentage(scale, index)})
                  </span>
              </h3>
              <div 
              className="imagesync-image-wrapper"
              onDoubleClick={() => this.handleImageDoubleClick(index)}
              >
                {this.renderImage(this.getImageSource(`image${index}`), index)}
              </div>
            </div>
          ))}
        </div>
        <div 
          className={`imagesync-controls-wrapper ${controlsVisible ? '' : 'hidden'}`}
          onMouseEnter={this.showControls}
          onMouseLeave={this.hideControls}
        >
          <div className="imagesync-controls">
            <span>Zoom: </span>
            <input 
              type="range" 
              min={minZoom} 
              max={maxZoom} 
              step="0.1"
              value={scale}
              onChange={this.handleZoomChange}
              className="imagesync-slider"
            />
            <span>{scale.toFixed(1)}x</span>
            <button onClick={this.handleReset} className="imagesync-button">Reset</button>
          </div>
        </div>
      </Block>
    );
  }
}

export default observer(ImageSyncComponent);