import { getRoot } from "mobx-state-tree";
import { FF_LSDV_4711, isFF } from "../../utils/feature-flags";
import { AnnotationPreview } from "../Common/AnnotationPreview/AnnotationPreview";

const imgDefaultProps = {};

if (isFF(FF_LSDV_4711)) imgDefaultProps.crossOrigin = "anonymous";

// Add a function to create a thumbnail URL
const createThumbnailUrl = (originalUrl, width = 100, height = 100) => {
  return `${originalUrl}?width=${width}&height=${height}`;
};

export const ImageCell = (column) => {
  const {
    original,
    value,
    column: { alias },
  } = column;
  const root = getRoot(original);

  const renderImagePreview = original.total_annotations === 0 || !root.showPreviews;
  const imgSrc = Array.isArray(value) ? value[0] : value;

  if (!imgSrc) return null;

  const thumbnailSrc = createThumbnailUrl(imgSrc);

  return renderImagePreview ? (
    <img
      {...imgDefaultProps}
      key={thumbnailSrc}
      src={thumbnailSrc}
      alt="Data"
      style={{
        maxHeight: "100%",
        maxWidth: "100px",
        objectFit: "contain",
        borderRadius: 3,
      }}
    />
  ) : (
    <AnnotationPreview
      task={original}
      annotation={original.annotations[0]}
      config={getRoot(original).SDK}
      name={alias}
      variant="120x120"
      fallbackImage={value}
      style={{
        maxHeight: "100%",
        maxWidth: "100px",
        objectFit: "contain",
        borderRadius: 3,
      }}
    />
  );
};
