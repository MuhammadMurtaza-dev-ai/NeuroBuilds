export const uploadImageToImgBB = async (file: File): Promise<string> => {
  const apiKey = import.meta.env.VITE_IMGBB_API_KEY as string;
  if (!apiKey || apiKey === 'your_api_key_placeholder') {
    throw new Error('ImgBB API key is not configured. Set VITE_IMGBB_API_KEY in your .env file.');
  }

  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Image upload failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json() as { success: boolean; data: { url: string }; error?: { message: string } };

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Image upload failed');
  }

  return result.data.url;
};
