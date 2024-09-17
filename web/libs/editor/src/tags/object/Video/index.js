import { inject, observer } from "mobx-react";
import Registry from "../../../core/Registry";

import { HtxVideoView } from "./HtxVideo";
import { VideoModel } from "./Video";
import { VideoSyncModel, HtxVideoSync } from "./VideoSync";

const HtxVideo = inject("store")(observer(HtxVideoView));

Registry.addTag("video", VideoModel, HtxVideo);
Registry.addObjectType(VideoModel);

export { VideoModel, HtxVideo, VideoSyncModel, HtxVideoSync };
