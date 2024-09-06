import React, { useState, useEffect } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

const Controls = ({ zoomIn, zoomOut, resetTransform }) => {
  return (
    <div className="tools">
      <button onClick={() => zoomIn()}>+</button>
      <button onClick={() => zoomOut()}>-</button>
      <button onClick={() => resetTransform()}>x</button>
    </div>
  );
};

const ImageViewer = ({ referenceImage, compareImages, onTransformChange }) => {
  const [transform, setTransform] = useState({
    scale: 1,
    positionX: 0,
    positionY: 0,
  });

  const updateTransform = (newTransform) => {
    setTransform(newTransform);
    onTransformChange(newTransform);
  };

  const renderImage = (image, isReference = false) => (
    <TransformWrapper
      scale={transform.scale}
      positionX={transform.positionX}
      positionY={transform.positionY}
      onZoom={({ state }) => updateTransform(state)}
      onPanning={({ state }) => updateTransform(state)}
    >
      {({ zoomIn, zoomOut, resetTransform }) => (
        <>
          {isReference && <Controls zoomIn={zoomIn} zoomOut={zoomOut} resetTransform={resetTransform} />}
          <TransformComponent>
            <img src={image} alt={isReference ? "Reference" : "Compare"} style={{ width: '100%' }} />
          </TransformComponent>
        </>
      )}
    </TransformWrapper>
  );

  return (
    <div style={{ display: 'flex', width: '100%' }}>
      <div style={{ flex: 1 }}>{renderImage(referenceImage, true)}</div>
      <div style={{ flex: 1 }}>
        {compareImages.map((image, index) => (
          <div key={index} style={{ marginBottom: '20px' }}>
            {renderImage(image)}
          </div>
        ))}
      </div>
    </div>
  );
};

export { ImageViewer };