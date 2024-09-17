import { inject } from "mobx-react";
import { destroy, getRoot, getType, types } from "mobx-state-tree";

import VideoSyncComponent from "../../../components/VideoCanvas/VideoSync";
import { customTypes } from "../../../core/CustomTypes";
import Registry from "../../../core/Registry";
import { AnnotationMixin } from "../../../mixins/AnnotationMixin";
import { IsReadyWithDepsMixin } from "../../../mixins/IsReadyMixin";
import { SyncableMixin } from "../../../mixins/Syncable";
// import { ProcessAttrsMixin } from "../../../mixins/ProcessAttrs";
import { parseValue } from "../../../utils/data";

import IsReadyMixin from "../../../mixins/IsReadyMixin";
import ObjectBase from "../Base";
import Debounce from "lodash.debounce";

const TagAttrsVS = types.compose(
    "TagAttrsVS",
    types.model({
      name: types.identifier,
    })
  );
const VideoSyncModel = types.compose(
    "VideoSyncModel",
    TagAttrsVS,
    ObjectBase,
    AnnotationMixin,
    IsReadyWithDepsMixin,
    types.model({
      type: "videosync",
      video0: types.maybe(types.string),
      video1: types.maybe(types.string),
      video2: types.maybe(types.string),
      framerate: types.maybe(types.string)
    }).views((self) => ({
      get store() {
        return getRoot(self);
      },
    })).actions((self) => ({
      afterCreate() {
        // Implementation here
      },
      // ... other actions
    }))
  );
  
const HtxVideoSync = inject("store")(VideoSyncComponent);
Registry.addTag("videosync", VideoSyncModel, HtxVideoSync);
Registry.addObjectType(VideoSyncModel);

export { HtxVideoSync, VideoSyncModel };