import { useStorage } from '../hooks/useStorage';
import GradientBackground from '../components/GradientBackground/GradientBackground';

export default function BlogPage() {
  const { data } = useStorage();

  const trendingPosts = data.trendingTopics;

  const blogPosts = data.blogPosts;

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 flex-grow pt-32 pb-20 px-4 md:px-8 max-w-[1440px] mx-auto w-full">
        {/* Featured Article */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
        <div className="lg:col-span-8 h-[500px] relative rounded-bento overflow-hidden group border border-white/10 shadow-2xl">
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{ backgroundImage: `url("${blogPosts[0].image}")` }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#1e1e1e] via-[#1e1e1e]/60 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#1e1e1e]/80 to-transparent"></div>
          <div className="absolute bottom-0 left-0 p-8 md:p-12 w-full z-20">
            <span className="px-3 py-1 rounded-full bg-primary/20 backdrop-blur-md text-xs font-bold text-primary mb-4 inline-block border border-primary/20">
              FEATURED STORY
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight max-w-3xl">
              {blogPosts[0].title}
            </h1>
            <p className="text-gray-300 text-lg line-clamp-2 max-w-2xl mb-6">
              {blogPosts[0].excerpt}
            </p>
            <div className="flex items-center gap-6 mt-4 text-sm text-gray-400 font-mono">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">calendar_today</span>
                {blogPosts[0].date}
              </span>
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-accent-purple">person</span>
                by {blogPosts[0].author}
              </span>
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">chat</span>
                {blogPosts[0].comments} Comments
              </span>
            </div>
          </div>
        </div>

        {/* Trending Sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="glass-panel rounded-bento p-8 h-full flex flex-col border-t-4 border-t-accent-purple">
            <h3 className="font-bold text-xl mb-6 flex items-center gap-2 pb-4 border-b border-white/5">
              <span className="material-symbols-outlined text-accent-purple">flash_on</span>
              Trending Now
            </h3>
            <div className="flex flex-col gap-6 overflow-y-auto pr-2 flex-grow">
              {trendingPosts.map((post, idx) => (
                <a key={idx} className="group block hover:opacity-80 transition-opacity cursor-pointer">
                  <span className="text-[10px] tracking-wider font-bold text-accent-purple mb-1 block uppercase">
                    {post.category}
                  </span>
                  <h4 className="font-bold text-white text-lg leading-snug group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h4>
                  <span className="text-gray-500 text-xs font-mono mt-2 block">{post.timeAgo}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Articles */}
      <div>
        <h2 className="text-3xl font-bold text-white mb-8 tracking-tight">
          Recent Articles <span className="text-gray-600 text-lg font-normal ml-2">// Latest Posts</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {blogPosts.slice(1).map((post) => (
            <article
              key={post.id}
              className="glass-panel rounded-bento overflow-hidden hover:border-primary/50 transition-all group cursor-pointer"
            >
              {/* Image */}
              <div className="h-48 overflow-hidden relative">
                <img
                  src={post.image}
                  alt={post.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                <span className="absolute top-4 right-4 px-3 py-1 rounded-full bg-primary/20 backdrop-blur text-xs font-bold text-primary border border-primary/20">
                  {post.category}
                </span>
              </div>

              {/* Content */}
              <div className="p-6">
                <h3 className="font-bold text-lg text-white mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                  {post.title}
                </h3>
                <p className="text-gray-400 text-sm mb-4 line-clamp-2">{post.excerpt}</p>

                <div className="flex items-center justify-between text-xs text-gray-500 font-mono pt-4 border-t border-white/5">
                  <span>{post.author} • {post.date}</span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">chat</span>
                    {post.comments}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Load More */}
      <div className="flex justify-center mt-12">
        <button className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-pill transition-all">
          Load More Articles
        </button>
      </div>
    </main>
    </>
  );
}
