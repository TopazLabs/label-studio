import React, { Component } from 'react';
import { observer } from "mobx-react";
import { Block } from "../../utils/bem";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import _debounce from "lodash/debounce";
import { parseValue } from "../../utils/data";

class ImageSyncComponent extends Component {
  constructor(props) {
    super(props);
    console.log("[dbg] props:", props);
    this.state = {
      scale: 1,
      position: [0, 0],
    };
    this.image0Ref = React.createRef();
    this.image1Ref = React.createRef();
    this.image2Ref = React.createRef();
    this.refsArray = [this.image0Ref, this.image1Ref, this.image2Ref];
  
    // Add this line
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyPan = this.handleKeyPan.bind(this);
  }

  handleKeyDown = (e) => {
    if (e.ctrlKey) {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        this.handleZoomOut();
      }
    } else {
      const panStep = 10; // Adjust this value to change the panning speed
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          this.handleKeyPan(0, panStep);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.handleKeyPan(0, -panStep);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.handleKeyPan(panStep, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.handleKeyPan(-panStep, 0);
          break;
        default:
          break;
      }
    }
  };

  componentDidMount() {
    window.addEventListener('keydown', this.handleKeyDown);
    this.applyWidthToParents();
  }
  
  componentDidUpdate() {
    this.applyWidthToParents();
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  handleWheel = (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY * -0.01;
      const newScale = Math.max(0.1, Math.min(this.state.scale + delta, 10));
      this.setState({ scale: newScale }, this.updateAllTransforms);
    }
  }

  handleMouseMove = _debounce((e) => {
    if (e.buttons === 1) { // Left mouse button is pressed
      const [x, y] = this.state.position;
      const newPosition = [x + e.movementX, y + e.movementY];
      this.setState({ position: newPosition }, this.updateAllTransforms);
    }
  }, 16)

  updateAllTransforms = () => {
    const { scale, position } = this.state;
    this.refsArray.forEach(ref => {
      if (ref.current) {
        ref.current.setTransform(position[0], position[1], scale);
      }
    });
  }

  handleZoomIn = () => {
    console.log("[DBG] handleZoomIn");
    const { scale: oldScale, position: oldPosition } = this.state;
    const newScale = oldScale * 1.2;
  
    // Use the center of the view as the zoom point
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const newPositionX = centerX - (centerX - oldPosition[0]) * (newScale / oldScale);
    const newPositionY = centerY - (centerY - oldPosition[1]) * (newScale / oldScale);
  
    this.setState({
      scale: newScale,
      position: [newPositionX, newPositionY]
    }, this.updateAllTransforms);
  };
  
  handleZoomOut = () => {
    console.log("[DBG] handleZoomOut");
    const { scale: oldScale, position: oldPosition } = this.state;
    const newScale = oldScale / 1.2;
  
    // Use the center of the view as the zoom point
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const newPositionX = centerX - (centerX - oldPosition[0]) * (newScale / oldScale);
    const newPositionY = centerY - (centerY - oldPosition[1]) * (newScale / oldScale);
  
    this.setState({
      scale: newScale,
      position: [newPositionX, newPositionY]
    }, this.updateAllTransforms);
  };

  handleZoom = (ref, event) => {
    console.log("[DBG] handleZoom");
    const { scale: oldScale, position: oldPosition } = this.state;
    const { scale: newScale } = event.state;
    
    // Calculate new position to keep the same point under the cursor
    const mouseX = event.centerX;
    const mouseY = event.centerY;
    const newPositionX = mouseX - (mouseX - oldPosition[0]) * (newScale / oldScale);
    const newPositionY = mouseY - (mouseY - oldPosition[1]) * (newScale / oldScale);
  
    this.setState({
      scale: newScale,
      position: [newPositionX, newPositionY]
    }, this.updateAllTransforms);
  }

  handleReset = () => {
    this.setState({ scale: 1, position: [0, 0] }, this.updateAllTransforms);
  }

  handleKeyPan = (deltaX, deltaY) => {
    const { width, height } = this.getImageDimensions();
    const panFactor = Math.min(width, height) * 0.05; // 2% of the smaller dimension

    this.setState(prevState => ({
      position: [
        prevState.position[0] + deltaX * panFactor,
        prevState.position[1] + deltaY * panFactor
      ]
    }), this.updateAllTransforms);
  };

  getImageDimensions = () => {
    const img = this.containerRef?.querySelector('img');
    if (img) {
      // console.log("img size:", img.width, img.height);
      return {
        width: img.width,
        height: img.height,
      };
    }
    return { width: 1, height: 1 };
  };

  getImageSource = (imageName) => {
    console.log("[DBG] getting image source");
    const { item, store } = this.props;
    const src = parseValue(item[imageName], store.task.dataObj);
    console.log("[DBG] image src:", src);
    return src;
  };

  renderImage = (src, ref, index) => (
    <TransformWrapper
      ref={ref}
      scale={this.state.scale}
      positionX={this.state.position[0]}
      positionY={this.state.position[1]}
      onZoom={this.handleZoom}
      onPanning={this.handlePan}
      options={{
        limitToBounds: false,
        minScale: 0.1,
        maxScale: 10,
      }}
      wheel={{
        step: 0.05, // Adjust this value for smoother zooming
      }}
      panning={{
        velocityDisabled: true,
      }}
      doubleClick={{
        disabled: true,
      }}
    >
      <TransformComponent>
        <img
          alt="synced image"
          src={src}
          className={`synced-image synced-image-${index}`}
          style={{ width: '100%', height: 'auto', maxHeight: '70vh', objectFit: 'contain' }}
        />
      </TransformComponent>
    </TransformWrapper>
  );
  
  applyWidthToParents = () => {
    const images = document.querySelectorAll('.synced-image');
    images.forEach(img => {
      let parent = img.closest('.react-transform-component');
      if (parent) {
        parent.style.width = '-webkit-fill-available';
        parent.style.width = '-moz-available';
        parent.style.width = 'stretch';
        
        let grandParent = parent.parentElement;
        if (grandParent) {
          grandParent.style.width = '-webkit-fill-available';
          grandParent.style.width = '-moz-available';
          grandParent.style.width = 'stretch';
        }
      }
    });
  }

  render() {
    const { item } = this.props;

    return (
      <Block 
      name="imagesync" 
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
      tabIndex={0}
      ref={(el) => this.containerRef = el}
    >
      <div style={{ padding: '10px', display: 'flex', justifyContent: 'center' }}>
        <button onClick={this.handleZoomIn}>+</button>
        <button onClick={this.handleZoomOut}>-</button>
        <button onClick={this.handleReset}>Reset</button>
      </div>
      <div style={{ display: 'flex', flexGrow: 1, gap: '5px', padding: '0', margin: '0' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', padding: '0', margin: '0' }}>
          <h3 style={{ margin: '0 0 5px 0' }}>Reference Image:</h3>
          {this.renderImage(this.getImageSource('image0'), this.image0Ref, 0)}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', padding: '0', margin: '0' }}>
          <h3 style={{ margin: '0 0 5px 0' }}>Enhanced 1:</h3>
          {this.renderImage(this.getImageSource('image1'), this.image1Ref, 1)}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', padding: '0', margin: '0' }}>
          <h3 style={{ margin: '0 0 5px 0' }}>Enhanced 2:</h3>
          {this.renderImage(this.getImageSource('image2'), this.image2Ref, 2)}
        </div>
      </div>
      <div style={{ padding: '10px', display: 'flex', justifyContent: 'center', backgroundColor: '#f0f0f0', marginTop: '10px', borderRadius: '5px' }}>
        <h4 style={{ margin: '0 0 5px 0' }}>Keyboard Shortcuts:</h4>
        <ul style={{ margin: '0', paddingLeft: '20px' }}>
          <li>Use <strong>CTRL & +</strong> to zoom in</li>
          <li>Use <strong>CTRL & -</strong> to zoom out</li>
          <li>Use <strong>Arrow keys</strong> to pan the images</li>
          <li>Use keys <strong>1 2 3</strong> to select the best image.</li>
        </ul>
      </div>
    </Block>
    );
  }
}

export default observer(ImageSyncComponent);