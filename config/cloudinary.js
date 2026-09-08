const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Generic factory so every module (profile photos, activity images,
// business gallery, chat images) gets its own Cloudinary folder.
const makeUploader = (folderName, allowedFormats = ['jpg', 'jpeg', 'png', 'webp']) => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `connecthub/${folderName}`,
      allowed_formats: allowedFormats,
      transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto' }],
    },
  });

  return multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per file
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'), false);
      }
    },
  });
};

const uploadProfilePhoto = makeUploader('profile-photos');
const uploadActivityImages = makeUploader('activity-images');
const uploadBusinessGallery = makeUploader('business-gallery');
const uploadChatImages = makeUploader('chat-images');
const uploadSocietyDocuments = makeUploader('society-documents', ['jpg', 'jpeg', 'png', 'pdf']);

const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return null;
  return cloudinary.uploader.destroy(publicId);
};

// Extract Cloudinary public_id from a stored secure_url so it can be deleted later.
const extractPublicId = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  const fileWithExt = parts[parts.length - 1];
  const folderPath = parts.slice(parts.indexOf('connecthub'), parts.length - 1).join('/');
  const fileName = fileWithExt.split('.')[0];
  return `${folderPath}/${fileName}`;
};

module.exports = {
  cloudinary,
  uploadProfilePhoto,
  uploadActivityImages,
  uploadBusinessGallery,
  uploadChatImages,
  uploadSocietyDocuments,
  deleteFromCloudinary,
  extractPublicId,
};
