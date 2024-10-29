import React, { useRef, useEffect, useState, Component } from 'react';
import { observer } from "mobx-react";
import { Block } from "../../utils/bem";
import { parseValue } from "../../utils/data";
import Debounce from "lodash.debounce";
import "./VideoSync.css";

const PAN_PXLS = 30;
const MIN_VISIBLE_RATIO = 0.01;
const POLL_INTERVAL_MS = 300;

class VideoSyncComponent extends Component {
    constructor(props) {
        super(props);
        this.state = {
            // Video State:
            scale: 1,
            position: [0, 0],
            minZoom: 0.5,
            maxZoom: 20,
            videosFitted: false,
            loadedVideos: [],

            // Component State
            isDragging: false,
            lastMousePosition: [0, 0],
            controlsVisible: false,

            // UI State:
            choices: [],
            controlsVisible: false,

            // Timeline State:
            duration: 0,
            currentTime: 0,
            isPlaying: false,
            framerate: 30,
        };
        this.containerRef = React.createRef();
        this.timelineRef = React.createRef();
        this.videoRefs = [React.createRef(), React.createRef(), React.createRef()];
        this.pollInterval = null;
        this.mouseLeaveTimer = null;

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleTimelineMove = this.handleTimelineMove.bind(this);
        this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
        this.calculateFramePercentage = this.calculateFramePercentage.bind(this);
    }

    componentDidMount() {
        document.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('resize', this.handleResize);
        document.addEventListener('mouseup', this.handleMouseUp);
        document.addEventListener('mousemove', this.handleMouseMove);
        this.containerRef.current.addEventListener('wheel', this.handleWheel, { passive: false });
        this.loadVideos();
        this.startPolling();
      }
    
      componentWillUnmount() {
        document.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('mouseup', this.handleMouseUp);
        document.removeEventListener('mousemove', this.handleMouseMove);
        if (this.containerRef.current) {
          this.containerRef.current.removeEventListener('wheel', this.handleWheel);
        }
        this.stopPolling();
        if (this.mouseLeaveTimer) {
          clearTimeout(this.mouseLeaveTimer);
        }
      }
    

      loadVideos() {
        const { item } = this.props;
        const videoPaths = ['video0', 'video1', 'video2'];
    
        videoPaths.forEach((videoName, index) => {
          const videoPath = this.getVideoSource(videoName);
          if (videoPath) {
            const video = document.createElement('video');
            video.onloadedmetadata = () => {
              this.setState(prevState => {
                const newLoadedVideos = [...prevState.loadedVideos, { index, path: videoPath }];
                newLoadedVideos.sort((a, b) => a.index - b.index);
                return { loadedVideos: newLoadedVideos };
              }, () => {
                this.initializeVideos();
              });
              this.fitVideosToColumns();
            };
            video.src = videoPath;
          }
        });
      }
    
      initializeVideos = () => {
        this.setState(prevState => {
          const updatedVideos = prevState.loadedVideos.map((loadedVideo, index) => {
            if (!loadedVideo.initialized) {
              const video = this.videoRefs[index];
              if (video && video.current) {
                video.current.addEventListener('loadedmetadata', () => this.handleLoadMeta(index));
                video.current.addEventListener('timeupdate', this.handleTimeUpdate);
              }
              return { ...loadedVideo, initialized: true };
            }
            return loadedVideo;
          });
          return { loadedVideos: updatedVideos };
        });
      }

    startPolling = () => {
        this.pollInterval = setInterval(this.updateChoices, POLL_INTERVAL_MS);
      }
    
      stopPolling = () => {
        if (this.pollInterval) {
          clearInterval(this.pollInterval);
        }
      }  

    handleResize = () => {
        this.fitVideosToColumns();
    }

    handleFramerateChange = (e) => {
        const framerate = Math.max(1, Math.min(240, parseInt(e.target.value) || 1));
        this.setState({ framerate: framerate });
    }

    handleKeyDown(e) {
        if (e.key === " " || e.code === "Space") {
            e.preventDefault();
            this.handlePlayPause();
            return;
        }
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
                case ',':
                    e.preventDefault();
                    this.stepBackward();
                    break;
                case '.':
                    e.preventDefault();
                    this.stepForward();
                    break;
                case 'r':
                case 'R':
                    e.preventDefault();
                    this.handleReset();
                    break;
                default:
                    break;
            }
        }
    }

    handleVideoDoubleClick = (index) => {
        this.simulateKeyPress(index + 1);
    }

    // handleWheel(e) {
    //     e.preventDefault();
    //     const delta = e.deltaY * -0.001;
    //     const newScale = Math.max(this.state.minZoom, Math.min(this.state.scale * (1 + delta), this.state.maxZoom));
    //     this.setState({ scale: newScale });
    // }

    handleWheel(e) {
        e.preventDefault();
        e.stopPropagation();
    
        const delta = e.deltaY * -0.001;
        const newScale = Math.max(this.state.minZoom, Math.min(this.state.scale * (1 + delta), this.state.maxZoom));
    
        const videoContainer = e.target.closest('[data-video-index]');
    
        if (!videoContainer) {
          return;
        }
        const videoIndex = parseInt(videoContainer.getAttribute('data-video-index'), 10);
    
        // Get mouse position for the current video
        const position = this.getMousePositionOnVideo(e, videoIndex);
    
        this.setState(prevState => ({
          scale: newScale
        }));
      }
    // handleWheel = (e) => {
    //     e.preventDefault();
    //     const delta = e.deltaY * -0.01;
    //     const newScale = Math.max(this.state.minZoom, Math.min(this.state.scale * (1 + delta), this.state.maxZoom));
        
    //     this.setState(prevState => {
    //         const { scale, position } = prevState;
    //         const mouseX = e.clientX - e.target.getBoundingClientRect().left;
    //         const mouseY = e.clientY - e.target.getBoundingClientRect().top;
    
    //         // Calculate how far the mouse is from the center of the video as a fraction
    //         const videoWidth = e.target.offsetWidth;
    //         const videoHeight = e.target.offsetHeight;
    //         const fractionX = (mouseX / videoWidth) - 0.5;
    //         const fractionY = (mouseY / videoHeight) - 0.5;
    
    //         // Calculate the new position
    //         const scaleFactor = newScale / scale;
    //         const newX = position[0] + (fractionX * videoWidth * (scaleFactor - 1));
    //         const newY = position[1] + (fractionY * videoHeight * (scaleFactor - 1));
    
    //         const newPosition = this.constrainPosition(newX, newY, newScale);
    
    //         return { scale: newScale, position: newPosition };
    //     });
    // }


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
            position: this.constrainPosition(
                prevState.position[0] + (deltaX * prevState.scale), 
                prevState.position[1] + (deltaY * prevState.scale), 
                prevState.scale)
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
            position: this.constrainPosition(
              prevState.position[0] + (deltaX / prevState.scale),
              prevState.position[1] + (deltaY / prevState.scale),
              prevState.scale),
            lastMousePosition: [e.clientX, e.clientY]
          }));
        } 
        else {
            const { clientY } = e;
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
        this.fitVideosToColumns();
    }

    handleLoadMeta(index) {
        const video = this.videoRefs[index].current;
        this.setState( prevState => ({ 
            duration: Math.max(prevState.duration, video.duration),
            framerate: Math.max(prevState.framerate, video.getVideoPlaybackQuality().totalVideoFrames / video.duration)
        }));
        video.currentTime = 0.1;
    }

    handleTimeUpdate = () => {
        const video = this.videoRefs[0].current;
        if (video) {
          const currentTime = video.currentTime;
          this.setState({ currentTime });
    
          // Check if the video has reached the end
          if (currentTime >= video.duration) {
            // Reset all videos to the beginning
            this.videoRefs.forEach(ref => {
              if (ref.current) {
                ref.current.currentTime = 0;
              }
            });
            this.syncVideos();
            // If it was playing, start playing again
            if (this.state.isPlaying) {
              this.videoRefs.forEach(ref => {
                if (ref.current) {
                  ref.current.play();
                }
              });
            }
          }
        }
      }

    handleTimelineMove(currentTime) {
        this.setState({ currentTime, isPlaying: false });
        this.videoRefs.forEach(ref => {
            if (ref.current) {
                ref.current.currentTime = currentTime;
            }
        });
    }

    handlePlayPause = () => {
        this.setState(prevState => {
            const newIsPlaying = !prevState.isPlaying;
            this.videoRefs.forEach(ref => {
                if (ref.current) {
                    if (newIsPlaying) {
                        ref.current.play();
                    } else {
                        ref.current.pause();
                    }
                }
            });
            return { isPlaying: newIsPlaying };
        });
    
        // Add this line to sync videos when pausing
        if (!this.state.isPlaying) {
            this.syncVideos();
        }
    }

    constrainPosition(x, y, scale) {
        return [x, y];
        // Todo: Fix this later
        const video = this.videoRefs
        .map(ref => ref.current)
        .filter(v => v) // Filter out any null or undefined refs
        .reduce((largest, current) => {
            if (!largest) return current;
            const largestArea = largest.videoWidth * largest.videoHeight;
            const currentArea = current.videoWidth * current.videoHeight;
            return currentArea > largestArea ? current : largest;
        }, null);
        
        if (!video) return [x, y];

        const width = video.videoWidth;
        const height = video.videoHeight;
    
        const containerRect = this.containerRef.current.getBoundingClientRect();
        const containerWidth = containerRect.width / 3; // Divide by 3 for the three videos
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

    getMousePositionOnVideo = (e, videoIndex) => {
        const { scale, position } = this.state;
        const video = this.videoRefs[videoIndex].current;
        const container = video.parentElement;
    
        // Get the bounding rectangles
        const containerRect = container.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();
    
        // Calculate the actual video dimensions considering the scale
        const actualVideoWidth = videoRect.width / scale;
        const actualVideoHeight = videoRect.height / scale;
    
        // Calculate the offset of the video within the container
        const videoOffsetX = (containerRect.width - actualVideoWidth) / 2;
        const videoOffsetY = (containerRect.height - actualVideoHeight) / 2;
    
        // Calculate the mouse position relative to the video
        let x = (e.clientX - containerRect.left - videoOffsetX - position[0]) / scale;
        let y = (e.clientY - containerRect.top - videoOffsetY - position[1]) / scale;
    
        // Ensure the coordinates are within the video bounds
        x = Math.max(0, Math.min(x, video.videoWidth));
        y = Math.max(0, Math.min(y, video.videoHeight));
    
        return { x: Math.round(x), y: Math.round(y) };
      }

    fitVideosToColumns = () => {
        const containerWidth = this.containerRef.current.clientWidth / this.state.loadedVideos.length;
        this.state.loadedVideos.forEach((loadedVideo, index) => {
          const video = this.videoRefs[index].current;
          if (video) {
            const aspectRatio = video.videoWidth / video.videoHeight;
            const newHeight = containerWidth / aspectRatio;
            video.style.width = `${containerWidth}px`;
            video.style.height = `${newHeight}px`;
          }
        });
    
        this.setState({ scale: 1, position: [0, 0], videosFitted: true });
      }

      updateChoices = () => {
        const choicesContainer = document.querySelector('.lsf-choices');
        if (choicesContainer) {
          const newChoices = Array.from(choicesContainer.children).map(choice => {
            const checkbox = choice.querySelector('input[type="checkbox"]');
            return checkbox ? checkbox.checked : false;
          });
    
          if (JSON.stringify(newChoices) !== JSON.stringify(this.state.choices)) {
            this.setState({ choices: newChoices });
          }
        }
      }

    showControls = () => {
        this.setState({ controlsVisible: true });
      }
    
    hideControls = () => {
        this.setState({ controlsVisible: false });
    }
    
    calculateFramePercentage(scale, videoIndex) {
        const container = document.querySelector('.VideoSync-video-container');
        if (!container) return 'Scale: 100%\nVideo Dims: 0x0';

        const video = this.videoRefs[videoIndex]?.current ?? null;
        if (!video) return 'Scale: 100%\nVideo Dims: 0x0';

        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        // Calculate the scale factor for both dimensions
        const widthScale = (containerWidth * scale) / videoWidth;
        const heightScale = (containerHeight * scale) / videoHeight;
        const overallScale = Math.min(widthScale, heightScale);
        const percentage = (overallScale * 100).toFixed(2);

        return `Scale: ${percentage}%\nVideo Dims: ${videoWidth}x${videoHeight}`;
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

    stepForward = () => {
        const { framerate } = this.state;
        this.stepVideo(1 / framerate);
      }
    
    stepBackward = () => {
        const { framerate } = this.state;
        this.stepVideo(-1 / framerate);
    }
    
    stepVideo = (time) => {
        this.videoRefs.forEach(ref => {
            if (ref.current) {
            ref.current.currentTime += time;
            }
        });
        this.syncVideos();
    }

    syncVideos = () => {
        const mainVideo = this.videoRefs[0].current;
        if (mainVideo) {
            const targetTime = mainVideo.currentTime;
            this.videoRefs.slice(1).forEach(ref => {
                if (ref.current) {
                    ref.current.currentTime = targetTime;
                }
            });
        }
        this.setState(prevState => {
            const newIsPlaying = prevState.isPlaying;
            return { isPlaying: newIsPlaying };
        });
    }

    getVideoSource = (videoName) => {
        const { item, store } = this.props;
        return parseValue(item[videoName], store.task.dataObj);
    }

    getVideoSourceByIndex = (index) => {
        const videoSource = this.getVideoSource(`video${index}`);
        return videoSource ?? null;
    }

    renderVideo = (src, index) => {
        const { scale, position } = this.state;
        const transform = `scale(${scale}) translate(${position[0]}px, ${position[1]}px)`;
    
        return (
          <video
            ref={this.videoRefs[index]}
            src={this.getVideoSource(`video${index}`)}
            className={`VideoSync-video synced-video-${index}`}
            style={{
                position: 'relative',
                top: '0%',
                left: '0%',
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                transform: transform,
                transformOrigin: 'center center',
                imageRendering: 'pixelated',
                msInterpolationMode: 'nearest-neighbor',
                cursor: this.state.isDragging ? 'grabbing' : 'grab',
            }}
            loop
            onTimeUpdate={this.handleTimeUpdate}
          />
        );
      }
    
      getVideoTitle(index) {
        const titles = ['Reference video:', 'Enhanced 1:', 'Enhanced 2:'];
        return titles[index] || `Video ${index}`;
      }

    render() {
        const {
            loadedVideos,
            scale,
            minZoom,
            maxZoom,
            choices,
            currentTime,
            isPlaying,
            duration,
            position,
            controlsVisible,
            framerate
          } = this.state;
          const transform = `translate(${position[0]}px, ${position[1]}px) scale(${scale})`;

          console.log("loadedVideos", loadedVideos);
        
          return (
            <Block
              name="videosync"
              className="VideoSync"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#f8f8f8',
              }}
              tabIndex={0}
              ref={this.containerRef}
            >
              <div className="VideoSync-container">
                {['video0', 'video1', 'video2'].map((video_i, index) => (
                    this.getVideoSourceByIndex(index) && <div
                    key={index}
                    data-video-index={index}
                    data-selected={choices[index]}
                    onMouseDown={this.handleMouseDown}
                    onMouseUp={this.handleMouseUp}
                    onWheel={this.handleWheel}
                    onDoubleClick={() => this.handleVideoDoubleClick(index)}
                    className={`VideoSync-item${choices[index] ? ' selected' : ''}`}
                    >
                    <h3 className="VideoSync-title">
                        {this.getVideoTitle(index)}
                        <span className="VideoSync-frame-percentage">
                        ({this.calculateFramePercentage(scale, index)})
                        </span>
                    </h3>
                    <div className="VideoSync-video-container">
                        {this.renderVideo(video_i, index)}
                    </div>
                    </div>
                ))}
                </div>
              <div
                className={`VideoControls-wrapper ${controlsVisible ? '' : 'hidden'}`}
                onMouseEnter={this.showControls}
                onMouseLeave={this.hideControls}
              >
               <VideoControls
                duration={duration}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onMove={this.handleTimelineMove}
                videoRef={this.videoRefs[0]}
                scale={scale}
                minZoom={minZoom}
                maxZoom={maxZoom}
                onZoomChange={this.handleZoomChange}
                onPlayPause={this.handlePlayPause}
                onReset={this.handleReset}
                onStepForward={this.stepForward}
                onStepBackward={this.stepBackward}
                framerate={framerate}
                onFramerateChange={this.handleFramerateChange}
                />
              </div>
            </Block>
        );
    }
}
  
const VideoControls = ({
    duration,
    currentTime,
    isPlaying,
    onMove,
    videoRef,
    scale,
    minZoom,
    maxZoom,
    onZoomChange,
    onPlayPause,
    onReset,
    onStepForward,
    onStepBackward,
    framerate,
    onFramerateChange
  }) => {
        const timelineRef = useRef(null);
        const [thumbnails, setThumbnails] = useState([]);
        const [isDragging, setIsDragging] = useState(false);
        const canvasRef = useRef(document.createElement('canvas'));
      
        useEffect(() => {
          if (videoRef.current && duration > 0) {
            generateThumbnails();
          }
        }, [videoRef, duration]);
      
        const generateThumbnails = async () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            const thumbCount = 10;
            const newThumbnails = [];
          
            canvas.width = 160;
            canvas.height = 90;
          
            // Create a new video element
            const tempVideo = document.createElement('video');
            tempVideo.crossOrigin = 'anonymous';  // Try setting crossOrigin
          
            // Create an object URL from the video source
            const response = await fetch(video.src);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
          
            // Set the object URL as the source of the temp video
            tempVideo.src = objectUrl;
          
            await new Promise(resolve => {
              tempVideo.onloadedmetadata = resolve;
            });
          
            for (let i = 0; i < thumbCount; i++) {
              const time = (duration / thumbCount) * i;
              tempVideo.currentTime = time;
          
              await new Promise(resolve => {
                tempVideo.onseeked = resolve;
              });
          
              ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
              const thumbnailUrl = canvas.toDataURL();
          
              newThumbnails.push({
                time: time,
                src: thumbnailUrl
              });
            }
          
            setThumbnails(newThumbnails);
          
            // Clean up
            URL.revokeObjectURL(objectUrl);
          };
      
        const handleMouseDown = (e) => {
          setIsDragging(true);
          handleMouseMove(e);
        };
      
        const handleMouseMove = (e) => {
          if (isDragging || e.type === 'mousedown') {
            const rect = timelineRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const newTime = (x / rect.width) * duration;
            onMove(Math.max(0, Math.min(newTime, duration)));
          }
        };
      
        const handleMouseUp = () => {
          setIsDragging(false);
        };
      
        useEffect(() => {
          document.addEventListener('mouseup', handleMouseUp);
          document.addEventListener('mousemove', handleMouseMove);
          return () => {
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('mousemove', handleMouseMove);
          };
        }, [isDragging]);
      
        const formatTime = (time) => {
          const minutes = Math.floor(time / 60);
          const seconds = Math.floor(time % 60);
          return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };
      
        return (
            <div className="VideoControls">
            <div className="Timeline" ref={timelineRef} onMouseDown={handleMouseDown}>
              {/* <div className="Timeline-thumbnails">
                {thumbnails.map((thumb, index) => (
                  <div key={index} className="Timeline-thumbnail" style={{left: `${(thumb.time / duration) * 100}%`}}>
                    <img src={thumb.src} alt={`Thumbnail at ${formatTime(thumb.time)}`} />
                  </div>
                ))}
              </div> */}
              <div className="Timeline-progress" style={{width: `${(currentTime / duration) * 100}%`}} />
              <div className="Timeline-cursor" style={{left: `${(currentTime / duration) * 100}%`}} />
              <div className="Timeline-time">{formatTime(currentTime)} / {formatTime(duration)}</div>
            </div>
            <div className="VideoControls-buttons">
                <button onClick={onStepBackward}>Step Backward</button>
                <PlayPauseButton 
                    isPlaying={isPlaying} 
                    onClick={onPlayPause}
                />
                <button onClick={onStepForward}>Step Forward</button>
                <input
                    type="number"
                    min="1"
                    max="240"
                    value={framerate}
                    onChange={onFramerateChange}
                    className="VideoControls-framerate"
                />
                <span>fps</span>
                <button onClick={onReset}>Reset</button>
                <span>Zoom: </span>
                <input
                    type="range"
                    min={minZoom}
                    max={maxZoom}
                    step="0.1"
                    value={scale}
                    onChange={onZoomChange}
                    className="VideoControls-slider"
                />
                <span className="VideoControls-value">{scale.toFixed(1)}x</span>
            </div>
          </div>
        );
      }


const PlayPauseButton = ({ isPlaying, onClick }) => {
return (
    <button 
    className={`play-pause-button ${isPlaying ? 'playing' : 'paused'}`} 
    onClick={onClick}
    aria-label={isPlaying ? 'Pause' : 'Play'}
    >
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        {isPlaying ? (
        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
        ) : (
        <path d="M8 5v14l11-7z" />
        )}
    </svg>
    </button>
);
};

export default observer(VideoSyncComponent);
