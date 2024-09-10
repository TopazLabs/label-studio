import React, { Component } from 'react';
import { observer } from "mobx-react";
import { Block } from "../../utils/bem";
import { parseValue } from "../../utils/data";
import debounce from 'lodash/debounce';

const PAN_PXLS = 30;
const MIN_VISIBLE_RATIO = 0.01;

class ImageSyncComponent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      scale: 1,
      position: [0, 0],
      imagesFitted: false,
      isDragging: false,
      lastMousePosition: [0, 0],
    };
    this.containerRef = React.createRef();
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.getMousePositionOnImage = this.getMousePositionOnImage.bind(this);
  }

  componentDidMount() {
    document.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('mousemove', this.handleMouseMove);
    this.containerRef.current.addEventListener('wheel', this.handleWheel, { passive: false });
    this.fitImagesToColumns();
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('mousemove', this.handleMouseMove);
    this.containerRef.current.removeEventListener('wheel', this.handleWheel);
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

  handleResize = () => {
    this.fitImagesToColumns();
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

  handleKeyDown(e) {
    if (e.ctrlKey) {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        this.handleZoomOut();
      }
    } else {

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          this.handleKeyPan(0, PAN_PXLS);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.handleKeyPan(0, -PAN_PXLS);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.handleKeyPan(PAN_PXLS, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.handleKeyPan(-PAN_PXLS, 0);
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
    const newScale = Math.max(0.1, Math.min(this.state.scale * (1 + delta), 10));
    
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
    
    
    
    // const mouseX = e.clientX - rect.left;
    // const mouseY = e.clientY - rect.top;


    // console.log("[DBG] Event:", e, "\n", "Rect:", rect);

    // const newPositionX = (position.x - (position.x - this.state.position[0])) * (newScale / this.state.scale);
    // const newPositionY = (position.y - (position.y - this.state.position[1])) * (newScale / this.state.scale);

    this.setState(prevState => ({
      scale: Math.max(0.5, Math.min(10.0, newScale))
    }));
    // this.setState({
    //   scale: newScale,
    //   position: [newPositionX, newPositionY]
    // });
  }

  handleZoomIn = () => {
    this.setState(prevState => ({
      scale: Math.min(10.0, prevState.scale * 1.2)
    }));
  };

  handleZoomOut = () => {
    this.setState(prevState => ({
      scale: Math.max(0.5, prevState.scale / 1.2)
    }));
  };

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
        position: this.constrainPosition(prevState.position[0] + deltaX, prevState.position[1] + deltaY, prevState.scale),
        lastMousePosition: [e.clientX, e.clientY]
      }));
    }
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
  };

  handleReset = () => {
    this.fitImagesToColumns();
  }

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
  
  getImageDimensions = () => {
    const img = this.containerRef?.querySelector('img');
    if (img) {
      return {
        width: img.width,
        height: img.height,
      };
    }
    return { width: 1, height: 1 };
  };

  getImageSource = (imageName) => {
    const { item, store } = this.props;
    return parseValue(item[imageName], store.task.dataObj);
  };

  renderImage = (src, index) => {
    const { scale, position } = this.state;
    const transform = `scale(${scale}) translate(${position[0]}px, ${position[1]}px)`;

    return (
      <div style={{ width: '100%', paddingBottom: '50%', position: 'relative', overflow: 'hidden' }}>
        <img
          alt={`synced image ${index}`}
          src={src}
          className={`synced-image synced-image-${index}`}
          style={{
            position: 'relative',
            top: '0%',
            left: '0%',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: transform,
            transformOrigin: 'center center',
          }}
        />
      </div>
    );
  };

  render() {
    const { item } = this.props;

    return (
      <Block 
        name="imagesync" 
        style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
        tabIndex={0}
        ref={this.containerRef}
        onWheel={this.handleWheel}
        onMouseDown={this.handleMouseDown}
      >
        <div style={{ padding: '10px', display: 'flex', justifyContent: 'center' }}>
          <button onClick={this.handleZoomIn}>+</button>
          <button onClick={this.handleZoomOut}>-</button>
          <button onClick={this.handleReset}>Reset</button>
        </div>
        <div style={{ display: 'flex', flexGrow: 1, gap: '5px', padding: '0', margin: '0' }}>
          <div data-image-index={0} style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', padding: '0', margin: '0' }}>
            <h3 style={{ margin: '0 0 5px 0' }}>Reference Image:</h3>
            {this.renderImage(this.getImageSource('image0'), 0)}
          </div>
          <div data-image-index={1} style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', padding: '0', margin: '0', height: '100%' }}>
            <h3 style={{ margin: '0 0 5px 0' }}>Enhanced 1:</h3>
            {this.renderImage(this.getImageSource('image1'), 1)}
          </div>
          <div data-image-index={2} style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', padding: '0', margin: '0', height: '100%' }}>
            <h3 style={{ margin: '0 0 5px 0' }}>Enhanced 2:</h3>
            {this.renderImage(this.getImageSource('image2'), 2)}
          </div>
        </div>
      </Block>
    );
  }
}

export default observer(ImageSyncComponent);