import { getRoot, types } from "mobx-state-tree";
import { observer } from "mobx-react";
import React, { Component, createRef, forwardRef, Fragment, memo, useEffect, useRef, useState } from "react";
import { Block } from "../../utils/bem";
import { ImageViewer } from "./ImageViewer";

class ImageSyncComponent extends Component {
  state = {
    referenceImage: null,
    compareImages: [],
  };

  componentDidMount() {
    this.updateImages();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.item.children !== this.props.item.children) {
      this.updateImages();
    }
  }

  updateImages = () => {
    const { item } = this.props;
    const images = item.children.filter(child => child.type === "image");
    if (images.length > 0) {
      this.setState({
        referenceImage: images[0].value,
        compareImages: images.slice(1).map(img => img.value),
      });
    }
  };

  handleTransformChange = (newTransform) => {
    const { item } = this.props;
    item.children.forEach(child => {
      if (child.type === "image" && child.setImageTransform) {
        child.setImageTransform(newTransform);
      }
    });
  };

  render() {
    const { referenceImage, compareImages } = this.state;

    return (
      <Block name="imagesync">
        {referenceImage && compareImages.length > 0 ? (
          <ImageViewer
            referenceImage={referenceImage}
            compareImages={compareImages}
            onTransformChange={this.handleTransformChange}
          />
        ) : (
          <div>No images to display</div>
        )}
      </Block>
    );
  }
}

export default observer(ImageSyncComponent);