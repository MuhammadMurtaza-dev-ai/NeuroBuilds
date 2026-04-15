# NeuroBuilds Temporary Storage System

This temporary storage system provides a centralized data management solution for development without fake hardcoded data scattered throughout components.

## Overview

- **Storage File**: `storage.json` - Contains all initial data for the application
- **Storage Hook**: `useStorage.ts` - Custom React hook for reading/writing data
- **Persistence**: Uses browser `localStorage` to persist all changes during development

## Data Structure

The `storage.json` contains the following data types:

### Blog Posts
- `id`: Unique identifier
- `title`: Post title
- `excerpt`: Short description
- `author`: Author handle
- `date`: Publication date
- `comments`: Comment count
- `category`: Blog category
- `image`: Featured image URL
- `featured`: Boolean flag for featured articles
- `content`: Full post content

### Products (Marketplace)
- `id`: Unique identifier
- `name`: Product name
- `description`: Short description
- `price`: Product price
- `category`: Product category
- `image`: Product image URL
- `status`: IN STOCK | HOT | LIMITED
- `statusColor`: Tailwind CSS classes for status badge
- `inStock`: Boolean flag

### Community Posts
- `id`: Unique identifier
- `title`: Post title
- `author`: Author handle
- `category`: Forum category
- `replies`: Number of replies
- `views`: Number of views
- `lastActivity`: When last updated
- `isPinned`: Boolean flag for pinned posts
- `content`: Full post content

### User Builds
- `id`: Unique identifier
- `name`: Build name
- `status`: draft | completed | published
- `components`: Number of components
- `budget`: Build budget
- `createdDate`: When created
- `thumbnail`: Build thumbnail image

### Users
- `id`: Unique identifier
- `name`: User full name
- `email`: User email
- `username`: Display username
- `avatar`: Avatar image URL
- `joinDate`: Account creation date

### Trending Topics
- `title`: Topic title
- `category`: Topic category
- `timeAgo`: How long ago posted
- `color`: Tailwind color class for category

## Usage

### Import the Hook
```tsx
import { useStorage } from '../hooks/useStorage';
```

### Read Data
```tsx
const { data } = useStorage();

// Access any data
const allBlogPosts = data.blogPosts;
const allProducts = data.products;
const communityPosts = data.communityPosts;
```

### Add New Items
```tsx
const { addBlogPost, addProduct, addCommunityPost } = useStorage();

// Add new blog post
const newPost = addBlogPost({
  title: 'New Post',
  excerpt: 'Post excerpt',
  author: '@username',
  date: 'Jan 30, 2026',
  comments: 0,
  category: 'Guide',
  image: 'https://...',
  featured: false,
  content: 'Full content here'
});

// Add new product
const newProduct = addProduct({
  name: 'GPU Name',
  description: 'Description',
  price: 999,
  category: 'components',
  image: 'https://...',
  status: 'IN STOCK',
  statusColor: 'bg-black/60',
  inStock: true
});
```

### Update Items
```tsx
const { updateBlogPost, updateProduct } = useStorage();

// Update existing blog post
updateBlogPost('post-id', {
  title: 'Updated Title',
  comments: 42
});

// Update product
updateProduct('product-id', {
  price: 899,
  status: 'LIMITED',
  inStock: false
});
```

### Delete Items
```tsx
const { deleteBlogPost, deleteProduct, deleteCommunityPost } = useStorage();

// Delete items
deleteBlogPost('post-id');
deleteProduct('product-id');
deleteCommunityPost('post-id');
```

### Backup & Reset
```tsx
const { exportData, resetStorage } = useStorage();

// Download all data as JSON file
exportData();

// Reset to initial storage.json data
resetStorage();
```

## How It Works

1. **Initialization**: On first load, `storage.json` is copied to `localStorage`
2. **Read Operations**: All components read from the in-memory `data` state (synced with localStorage)
3. **Write Operations**: Any add/update/delete operation updates both state and localStorage
4. **Persistence**: Data persists across browser refreshes until localStorage is manually cleared

## File Locations

```
src/
  data/
    storage.json          // Initial data
  hooks/
    useStorage.ts         // Storage hook with CRUD operations
  pages/
    BlogPage.tsx          // Uses useStorage hook
    MarketplacePage.tsx   // Uses useStorage hook
    CommunityPage.tsx     // Uses useStorage hook
```

## Clearing Storage

To reset all data to defaults:
```tsx
const { resetStorage } = useStorage();
resetStorage();
```

Or manually clear in browser:
```javascript
localStorage.removeItem('neurobuilds_data');
```

## Notes

- All IDs are generated using `Date.now().toString()` for simplicity
- Storage key is `'neurobuilds_data'`
- This system is designed for development only
- For production, replace with proper backend API integration
