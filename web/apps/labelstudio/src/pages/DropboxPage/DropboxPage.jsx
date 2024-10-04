import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Modal } from "../../components/Modal/Modal";
import { useAPI } from '../../providers/ApiProvider';
import { BemWithSpecifiContext } from "../../utils/bem";
import './DropboxPage.css';

const { Block, Elem } = BemWithSpecifiContext();

export const DropboxPage = () => {
  const { id } = useParams();
  const api = useAPI();
  const [images, setImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchImages();
  }, [id]);

  const fetchImages = async () => {
    try {
      const response = await api.callApi('getDropbox', { params: { pk: id } });
      setImages(response);
    } catch (error) {
      console.error('Error fetching images:', error);
    }
  };

  const handleImageClick = (image) => {
    setSelectedImage(image);
  };

  const handleCloseOverlay = () => {
    setSelectedImage(null);
  };

  const handleDeleteImage = async () => {
    if (window.confirm('Are you sure you want to delete this image?')) {
      try {
        await api.callApi('deleteDropbox', { params: { pk: id, image: selectedImage.img } });
        setSelectedImage(null);
        fetchImages();
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }
  };

  const handleDownloadImage = (image) => {
    window.open(`${api.api.gateway}/dm/dropbox?pk=${id}&image=${image}&download=true`, '_blank');
  };

  const handleDownloadAll = () => {
    window.open(`${api.api.gateway}/dm/dropbox?pk=${id}&download=true`, '_blank');
  };

  const handleFileChange = (event) => {
    setSelectedFiles(Array.from(event.target.files));
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (selectedFiles.length === 0) {
      alert('Please select files to upload');
      return;
    }
    const formData = new FormData();
    formData.append('pk', id);
    selectedFiles.forEach((file, index) => {
      formData.append(`files`, file);
    });

    try {
      const response = await fetch(`${api.api.gateway}/dm/dropbox`, {
        method: 'POST',
        headers: {
            // Include any necessary headers, like authentication
            // 'Authorization': `Bearer ${your_auth_token}`,
          },
          body: formData,
        credentials: 'include', // This is important for including cookies
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const result = await response.json();
      console.log('Upload response:', result);
      setSelectedFiles([]);
      fileInputRef.current.value = '';
      fetchImages();
    } catch (error) {
      console.error('Error uploading files:', error);
    }
  };

  return (
    <Modal
      title="Project Dropbox"
      className="full-screen-modal"
      closeOnClickOutside={false}
      onHide={() => window.location.href = `/projects/${id}/`}
      visible={true}
      fullscreen={true}
    >
      <div className="dropbox-page">
        <h1>Dropbox</h1>
        <div className="dropbox-actions">
          <button className="download-all-btn" onClick={handleDownloadAll}>Download All</button>
          <div className="file-upload">
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              ref={fileInputRef}
              name="files"
            />
            <input
              type="hidden"
              value={id}
              name="pk"
            />
            <button onClick={handleUpload}>Upload Files</button>
          </div>
        </div>
        <div className={`image-grid ${selectedImage ? 'with-overlay' : ''}`}>
          {images.map((image) => (
            <div key={image.img} className="image-item" onClick={() => handleImageClick(image)}>
              <img src={image.thumbnail} alt={image.img} />
            </div>
          ))}
        </div>
        {selectedImage && (
          <div className="image-overlay">
            <div className="overlay-content">
              {['png', 'jpg', 'jpeg', 'gif', 'bmp', 'raw', 'tiff'].includes(selectedImage.img.split('.').pop().toLowerCase()) ? (
                <img src={`${api.api.gateway}/dm/dropbox?pk=${id}&image=${selectedImage.img}`} alt={selectedImage.img} />
              ) : (
                <video controls>
                  <source src={`${api.api.gateway}/dm/dropbox?pk=${id}&image=${selectedImage.img}`} type={`video/${selectedImage.img.split('.').pop().toLowerCase()}`} />
                  Your browser does not support the video tag.
                </video>
              )}
              <div className="overlay-actions">
                <button onClick={() => handleDownloadImage(selectedImage.img)}>Download</button>
                <button onClick={handleDeleteImage}>Delete</button>
                <button onClick={handleCloseOverlay}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

DropboxPage.path = "/dropbox";
DropboxPage.modal = true;