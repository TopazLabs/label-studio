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
            maxZoom: 15,
            videosFitted: false,

            // Component State
            isDragging: false,
            lastMousePosition: [0, 0],

            // UI State:
            choices: [],
            controlsVisible: false,

            // Timeline State:
            duration: 0,
            currentTime: 0,
            isPlaying: false,
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
        addEventListener('wheel', this.handleWheel, { passive: false });
        this.fitVideosToColumns();
        this.startPolling();
        this.initializeVideos();
    }

    componentWillUnmount() {
        document.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('resize', this.handleResize);
        this.stopPolling();
        if (this.mouseLeaveTimer) {
            clearTimeout(this.mouseLeaveTimer);
        }
    }

    initializeVideos() {
        this.videoRefs.forEach((ref, index) => {
            const video = ref.current;
            if (video) {
                video.addEventListener('loadedmetadata', () => this.handleLoadMeta(index));
                video.addEventListener('timeupdate', this.handleTimeUpdate);
            }
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
        const delta = e.deltaY * -0.001;
        const newScale = Math.max(this.state.minZoom, Math.min(this.state.scale * (1 + delta), this.state.maxZoom));
        
        this.setState(prevState => {
            const { scale, position } = prevState;
            
            // Find the first element with the "VideoSync-video-container" class
            const container = document.querySelector('.VideoSync-video-container');
            if (!container) return prevState; // If no container found, return current state
            
            const containerWidth = container.style.width;
            const containerHeight = container.style.height;
            
            // Get the dimensions of the video (assuming the first video is representative)
            const video = this.videoRefs[0].current;
            const imgWidth = video.videoWidth * scale;
            const imgHeight = video.videoHeight * scale;
            
            // Calculate the center of the container in image coordinates
            const containerCenterX = (containerWidth / 2 - position[0]) / scale;
            const containerCenterY = (containerHeight / 2 - position[1]) / scale;
            
            // Calculate the new position based on the change in scale
            const scaleFactor = newScale / scale;
            const newX = -containerCenterX * newScale + containerWidth / 2;
            const newY = -containerCenterY * newScale + containerHeight / 2;
            
            // do a console.log to debug this code:
            console.log('Wheel event:', {
                delta,
                newScale,
                containerWidth,
                containerHeight,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                currentScale: scale,
                currentPosition: position,
                containerCenterX,
                containerCenterY,
                newX,
                newY,
                scaleFactor
            });

            // Constrain the new position
            const newPosition = this.constrainPosition(newX, newY, newScale);
            
            return { scale: newScale, position: newPosition };
        });
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
                position: this.constrainPosition(prevState.position[0] + (deltaX * prevState.scale), prevState.position[1] + (deltaY * prevState.scale), prevState.scale),
                lastMousePosition: [e.clientX, e.clientY]
            }));
        } else {
            const { clientHeight } = document.documentElement;
            const threshold = clientHeight - 70; // Adjust based on your controls height

            if (e.clientY > threshold) {
            this.showControls();
            if (this.mouseLeaveTimer) {
                clearTimeout(this.mouseLeaveTimer);
                this.mouseLeaveTimer = null;
            }
            } else if (!this.mouseLeaveTimer) {
                this.mouseLeaveTimer = setTimeout(() => {
                    this.hideControls();
                }, 2000); // Hide controls after 2 seconds
            }
        }
    }

    handleReset = () => {
        this.fitVideosToColumns();
    }

    handleLoadMeta(index) {
        const video = this.videoRefs[index].current;
        if (index === 0) {
            this.setState({ duration: video.duration });
        }
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

        const containerRect = container.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();

        const actualVideoWidth = videoRect.width / scale;
        const actualVideoHeight = videoRect.height / scale;

        const videoOffsetX = (containerRect.width - actualVideoWidth) / 2;
        const videoOffsetY = (containerRect.height - actualVideoHeight) / 2;

        let x = (e.clientX - containerRect.left - videoOffsetX - position[0]) / scale;
        let y = (e.clientY - containerRect.top - videoOffsetY - position[1]) / scale;

        x = Math.max(0, Math.min(x, video.videoWidth));
        y = Math.max(0, Math.min(y, video.videoHeight));

        return { x: Math.round(x), y: Math.round(y) };
    }

    fitVideosToColumns = () => {
        const containerWidth = this.containerRef.current.clientWidth / 3;
        this.videoRefs.forEach(ref => {
            const video = ref.current;
            if (video) {
                video.style.width = `${containerWidth}px`;
                video.style.height = 'auto';
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
        if (!container) return '100%'; // Default to 100% if container not found

        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        console.log(`Container dimensions: ${containerWidth}x${containerHeight}`);

        const video = this.videoRefs[videoIndex].current;
        if (!video) {
            console.log('Video not found, returning 100%');
            return '100%'; // Default to 100% if video not found
        }

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        console.log(`Video dimensions: ${videoWidth}x${videoHeight}`);

        // Calculate the scale factor for both dimensions
        const widthScale = (containerWidth * scale) / videoWidth;
        const heightScale = (containerHeight * scale) / videoHeight;
        console.log(`Width scale: ${widthScale}, Height scale: ${heightScale}`);

        // Use the smaller scale factor to determine the overall scale
        const overallScale = Math.min(widthScale, heightScale);
        console.log(`Overall scale: ${overallScale}`);

        // Convert to percentage and round to 2 decimal places
        const percentage = (overallScale * 100).toFixed(2);
        console.log(`Final percentage: ${percentage}%`);

        return `${percentage}%`;
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

    getVideoSource = (videoName) => {
        const { item, store } = this.props;
        return parseValue(item[videoName], store.task.dataObj);
    }

    renderVideo(src, index) {
        return (
            <video
            ref={this.videoRefs[index]}
            src={src}
            className={`VideoSync-video synced-video-${index}`}
            style={{
                transform: `scale(${this.state.scale}) translate(${this.state.position[0]}px, ${this.state.position[1]}px)`,
                transformOrigin: 'center center',
                cursor: this.state.isDragging ? 'grabbing' : 'grab',
            }}
            loop // Add this attribute
            onTimeUpdate={this.handleTimeUpdate}
            />
        );
    }

    render() {
        const {
            scale,
            minZoom,
            maxZoom,
            choices,
            currentTime,
            isPlaying,
            duration,
            position,
            controlsVisible,
          } = this.state;
          const transform = `translate(${position[0]}px, ${position[1]}px) scale(${scale})`;
        
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
                {['Reference video:', 'Enhanced 1:', 'Enhanced 2:'].map((title, index) => (
                  <div
                    key={index}
                    className={`VideoSync-item${choices[index] ? ' selected' : ''}`}
                    data-video-index={index}
                    data-selected={choices[index]}
                    onMouseDown={this.handleMouseDown}
                    onMouseUp={this.handleMouseUp}
                    onMouseMove={this.handleMouseMove}
                    onWheel={this.handleWheel}
                    onDoubleClick={() => this.handleVideoDoubleClick(index)}
                  >
                    <h3 className="VideoSync-title">
                            {title} 
                            <span className="VideoSync-frame-percentage">
                                ({this.calculateFramePercentage(scale, index)})
                            </span>
                        </h3>
                    <div className={"VideoSync-video-container"}>
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
                />
              </div>
            </Block>
        );        
    }
}
  
const VideoControls = observer(({ 
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
        onReset
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
              <PlayPauseButton 
                isPlaying={isPlaying} 
                onClick={onPlayPause} />
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
      });


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