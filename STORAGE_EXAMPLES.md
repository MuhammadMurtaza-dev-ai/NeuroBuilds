# Quick Examples - Using the Storage System

## Example 1: Display All Blog Posts

```tsx
import { useStorage } from '../hooks/useStorage';

export default function BlogList() {
  const { data } = useStorage();

  return (
    <div>
      {data.blogPosts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
          <span>{post.author} • {post.date}</span>
        </article>
      ))}
    </div>
  );
}
```

## Example 2: Add a New Blog Post

```tsx
import { useStorage } from '../hooks/useStorage';

export default function CreateBlogPost() {
  const { addBlogPost } = useStorage();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const newPost = addBlogPost({
      title: formData.get('title') as string,
      excerpt: formData.get('excerpt') as string,
      author: '@author_handle',
      date: new Date().toLocaleDateString(),
      comments: 0,
      category: formData.get('category') as string,
      image: formData.get('image') as string,
      featured: false,
      content: formData.get('content') as string,
    });

    console.log('New post created:', newPost);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Post title" required />
      <textarea name="excerpt" placeholder="Excerpt" required />
      <select name="category">
        <option>Guide</option>
        <option>Build Log</option>
        <option>Analysis</option>
      </select>
      <input name="image" type="url" placeholder="Image URL" />
      <textarea name="content" placeholder="Full content" required />
      <button type="submit">Create Post</button>
    </form>
  );
}
```

## Example 3: Search and Filter Products

```tsx
import { useStorage } from '../hooks/useStorage';
import { useState } from 'react';

export default function ProductSearch() {
  const { data } = useStorage();
  const [search, setSearch] = useState('');

  const filtered = data.products.filter(
    product => product.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <input 
        type="text"
        placeholder="Search products..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      
      <div className="product-grid">
        {filtered.map(product => (
          <div key={product.id} className="product-card">
            <h3>{product.name}</h3>
            <p>${product.price}</p>
            <span className={product.statusColor}>{product.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Example 4: Update Product Stock Status

```tsx
import { useStorage } from '../hooks/useStorage';

export default function ProductManager() {
  const { updateProduct } = useStorage();

  const markAsHot = (productId: string) => {
    updateProduct(productId, {
      status: 'HOT',
      statusColor: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30'
    });
  };

  const outOfStock = (productId: string) => {
    updateProduct(productId, {
      inStock: false,
      status: 'LIMITED',
      statusColor: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    });
  };

  return (
    <div>
      <button onClick={() => markAsHot('product-1')}>Mark as HOT</button>
      <button onClick={() => outOfStock('product-1')}>Out of Stock</button>
    </div>
  );
}
```

## Example 5: Delete Community Post

```tsx
import { useStorage } from '../hooks/useStorage';

export default function CommunityModerator() {
  const { deleteCommunityPost } = useStorage();

  const removeSpam = (postId: string) => {
    deleteCommunityPost(postId);
    console.log('Spam post removed');
  };

  return (
    <button onClick={() => removeSpam('post-123')}>
      Delete This Post
    </button>
  );
}
```

## Example 6: View Trending Topics

```tsx
import { useStorage } from '../hooks/useStorage';

export default function TrendingWidget() {
  const { data } = useStorage();

  return (
    <div className="trending-sidebar">
      <h3>Trending Now</h3>
      {data.trendingTopics.map((topic, idx) => (
        <div key={idx}>
          <span className={topic.color}>{topic.category}</span>
          <h4>{topic.title}</h4>
          <p>{topic.timeAgo}</p>
        </div>
      ))}
    </div>
  );
}
```

## Example 7: Export and Backup Data

```tsx
import { useStorage } from '../hooks/useStorage';

export default function DataBackup() {
  const { exportData, resetStorage } = useStorage();

  return (
    <div>
      <button onClick={exportData}>
        📥 Download All Data as JSON
      </button>
      <button onClick={resetStorage} style={{ marginLeft: '10px' }}>
        🔄 Reset to Defaults
      </button>
    </div>
  );
}
```

## Example 8: Create User Build Profile

```tsx
import { useStorage } from '../hooks/useStorage';

export default function CreateBuildProfile() {
  const { addUserBuild } = useStorage();

  const saveBuild = () => {
    const newBuild = addUserBuild({
      name: '4K Gaming Rig',
      status: 'draft',
      components: 12,
      budget: 2500,
      createdDate: new Date().toLocaleDateString(),
      thumbnail: null
    });

    console.log('Build saved:', newBuild);
  };

  return (
    <button onClick={saveBuild}>Save My Build</button>
  );
}
```

## Example 9: Get Featured Blog Post

```tsx
import { useStorage } from '../hooks/useStorage';

export default function FeaturedPost() {
  const { data } = useStorage();
  
  const featured = data.blogPosts.find(post => post.featured);

  if (!featured) return <p>No featured post</p>;

  return (
    <article>
      <img src={featured.image} alt={featured.title} />
      <h1>{featured.title}</h1>
      <p>{featured.excerpt}</p>
      <a href={`/blog/${featured.id}`}>Read More →</a>
    </article>
  );
}
```

## Example 10: User Authentication (Create User)

```tsx
import { useStorage } from '../hooks/useStorage';

export default function AuthSignup() {
  const { addUser } = useStorage();

  const handleSignup = async (email: string, username: string, name: string) => {
    const newUser = addUser({
      email,
      username,
      name,
      avatar: null,
      joinDate: new Date().toLocaleDateString()
    });

    console.log('User registered:', newUser);
    // Proceed with login...
  };

  return (
    <button onClick={() => handleSignup('user@example.com', '@username', 'John Doe')}>
      Create Account
    </button>
  );
}
```

---

## Key Points to Remember

1. **Always use the hook** - `useStorage()` in every component that needs data
2. **Data is reactive** - Changes update automatically across all components
3. **Persistence is automatic** - No need to manually save to localStorage
4. **TypeScript types available** - Import types from `useStorage` for safety
5. **No async required** - All operations are synchronous and instant
6. **Use exportData** before major refactoring to backup current state

## Common Patterns

### Loading & Error States (Optional since data loads instantly)
```tsx
const { data } = useStorage();

if (!data.blogPosts.length) {
  return <p>No posts yet</p>;
}
```

### Filtering Data
```tsx
const filtered = data.products.filter(
  p => p.category === selectedCategory && p.inStock
);
```

### Sorting Data
```tsx
const sorted = [...data.blogPosts].sort(
  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
);
```

### Pagination
```tsx
const ITEMS_PER_PAGE = 10;
const page = 1;
const paginated = data.blogPosts.slice(
  (page - 1) * ITEMS_PER_PAGE,
  page * ITEMS_PER_PAGE
);
```
