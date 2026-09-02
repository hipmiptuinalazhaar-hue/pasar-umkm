"use strict";const CONFIG=Object.freeze({APP_NAME:"Pasar UMKM",CITY:"Lubuklinggau",ORGANIZATION:"HIPMI PT UIN Al Azhaar Lubuklinggau",INITIATOR:"Capryan Agusto",DEMO_MODE:!1,API_BASE_URL:"",STORAGE_KEY:"pasar-umkm-ui-v7",INTRO_KEY:"pasar-umkm-intro-v7",SPLASH_DURATION:950,SPLASH_EXIT_DURATION:320,TOAST_DURATION:2200,SEARCH_MIN_LENGTH:2}),ASSETS=Object.freeze({logo:"assets/logo.webp"});let CATEGORIES=[];const DATA={stories:[],posts:[],stores:[],notifications:[],messages:[],orders:[]},STATE={user:null,currentStore:null,activeNav:"home",activeCategory:null,searchQuery:"",likedPosts:new Set,savedPosts:new Set,cart:[],accountProducts:[],menuOpen:!1,searchOpen:!1,activeSheet:null,loading:!1},DOM={};document.addEventListener("DOMContentLoaded",initializeApp);async function initializeApp(){cacheDOM(),restoreLocalState(),bindEvents(),setupSplash(),setLoading(!0);try{await loadInitialData()}catch(error){console.error("[Pasar UMKM] Bootstrap error:",error),showToast("Data belum dapat dimuat.")}finally{setLoading(!1)}renderApplication(),handleScroll()}function cacheDOM(){DOM.splash=document.getElementById("splashIntro"),DOM.header=document.querySelector(".app-header")||document.getElementById("header"),DOM.storiesSection=document.getElementById("storiesSection"),DOM.stories=document.getElementById("stories"),DOM.homeDiscovery=document.getElementById("homeDiscovery"),DOM.quickCategories=document.getElementById("quickCategories"),DOM.feed=document.getElementById("feed"),DOM.menuButton=document.getElementById("menuButton"),DOM.headerSearchButton=document.getElementById("headerSearchButton"),DOM.notificationButton=document.getElementById("notificationButton"),DOM.messageButton=document.getElementById("messageButton"),DOM.sideMenu=document.getElementById("sideMenu"),DOM.closeMenuButton=document.getElementById("closeMenuButton"),DOM.sideMenuContent=document.getElementById("sideMenuContent"),DOM.sideAccountGuest=document.getElementById("sideAccountGuest"),DOM.sideAccountUser=document.getElementById("sideAccountUser"),DOM.sideAccountUserName=document.getElementById("sideAccountUserName"),DOM.sideAccountUserRole=document.getElementById("sideAccountUserRole"),DOM.searchOverlay=document.getElementById("searchOverlay"),DOM.closeSearchButton=document.getElementById("closeSearchButton"),DOM.searchInput=document.getElementById("searchInput"),DOM.searchClearButton=document.getElementById("searchClearButton"),DOM.searchResults=document.getElementById("searchResults"),DOM.navigation=document.getElementById("appNavigation"),DOM.sheetOverlay=document.getElementById("sheetOverlay"),DOM.bottomSheet=document.getElementById("bottomSheet"),DOM.sheetContent=document.getElementById("sheetContent"),DOM.toast=document.getElementById("toast"),DOM.loading=document.getElementById("appLoading")}async function loadInitialData(){if(await restoreAuthSession(),STATE.currentStore=null,STATE.user?.role==="seller"||STATE.user?.role==="admin")try{STATE.currentStore=await loadCurrentAccountStore()}catch(error){console.error("[Pasar UMKM] Current store load error:",error),STATE.currentStore=null}await loadCategories(),await loadStores();const[productsResponse,postsResponse]=await Promise.all([fetch("/api/products",{method:"GET",credentials:"include",headers:{Accept:"application/json"},cache:"no-store"}),fetch("/api/posts",{method:"GET",credentials:"include",headers:{Accept:"application/json"},cache:"no-store"})]),feedItems=[];if(productsResponse.ok){const productsData=await productsResponse.json();if(productsData.ok===!0&&Array.isArray(productsData.products)){const productPosts=productsData.products.map(product=>({id:`product-${product.id}`,store:{id:product.store_id,name:product.store_name||"UMKM Lokal",avatar:product.store_logo_url||ASSETS.logo,location:CONFIG.CITY,verified:product.store_verification_status==="verified"},caption:product.description||"",createdAt:product.created_at,commentsCount:Number(product.comments_count||0),product:{id:product.id,name:product.name,image:product.image_url||ASSETS.logo,category:product.category_name||"",categoryId:product.category_id||"",price:Number(product.price||0),stock:Number(product.stock||0),unit:product.unit||""}}));feedItems.push(...productPosts)}}if(postsResponse.ok){const postsData=await postsResponse.json();if(postsData.ok===!0&&Array.isArray(postsData.posts)){const publicPosts=postsData.posts.map(post=>{const location=[post.store_district,post.store_city].filter(Boolean).join(", ")||CONFIG.CITY;return{id:`post-${post.id}`,backendId:post.id,store:{id:post.store_id,name:post.store_name||"UMKM Lokal",avatar:post.store_logo_url||ASSETS.logo,location,verified:post.store_verification_status==="verified"},location,caption:post.caption||"",createdAt:post.created_at,media:{type:"image",src:post.image_url,alt:post.caption||`Postingan ${post.store_name||"UMKM"}`},likesCount:0,commentsCount:Number(post.comments_count||0)}});feedItems.push(...publicPosts)}}if(feedItems.sort((a,b)=>{const dateA=new Date(a.createdAt||0).getTime();return new Date(b.createdAt||0).getTime()-dateA}),DATA.posts=feedItems,!CONFIG.API_BASE_URL)return;const bootstrap=await apiRequest("/api/bootstrap");bootstrap&&(DATA.stories=ensureArray(bootstrap.stories),DATA.posts=ensureArray(bootstrap.posts),DATA.notifications=ensureArray(bootstrap.notifications),DATA.messages=ensureArray(bootstrap.messages),DATA.orders=ensureArray(bootstrap.orders),bootstrap.user&&(STATE.user=bootstrap.user),Array.isArray(bootstrap.cart)&&(STATE.cart=bootstrap.cart))}async function loadCategories(){try{const response=await fetch("/api/categories",{method:"GET",credentials:"include",headers:{Accept:"application/json"},cache:"no-store"});if(!response.ok)throw new Error(`Categories request failed: ${response.status}`);const data=await response.json();if(data.ok!==!0||!Array.isArray(data.categories))throw new Error("Format data kategori tidak valid.");CATEGORIES=data.categories.map(category=>({id:String(category.id||""),slug:String(category.slug||""),name:String(category.name||""),icon:String(category.icon||"tag"),home:!!category.is_home,sortOrder:Number(category.sort_order)||0})).filter(category=>category.id&&category.name).sort((a,b)=>a.sortOrder-b.sortOrder)}catch(error){console.error("[Pasar UMKM] Categories load error:",error),CATEGORIES=[],showToast("Kategori belum dapat dimuat.")}}async function loadStores(){try{const response=await fetch("/api/stores",{method:"GET",credentials:"include",headers:{Accept:"application/json"},cache:"no-store"});if(!response.ok)throw new Error(`Stores request failed: ${response.status}`);const data=await response.json();if(data.ok!==!0||!Array.isArray(data.stores))throw new Error("Format data UMKM tidak valid.");DATA.stores=data.stores.map(store=>({id:String(store.id||""),categoryId:String(store.category_id||""),category:String(store.category_name||""),name:String(store.name||""),slug:String(store.slug||""),description:String(store.description||""),logo:String(store.logo_url||""),cover:String(store.cover_url||""),phone:String(store.phone||""),whatsapp:String(store.whatsapp||""),address:String(store.address||""),district:String(store.district||""),city:String(store.city||""),province:String(store.province||""),verificationStatus:String(store.verification_status||"pending"),verifiedAt:store.verified_at||null,productCount:Number(store.product_count||0),createdAt:store.created_at||null})).filter(store=>store.id&&store.name)}catch(error){console.error("[Pasar UMKM] Stores load error:",error),DATA.stores=[],showToast("Daftar UMKM belum dapat dimuat.")}}async function restoreAuthSession(){try{const response=await fetch("/api/auth/me",{method:"GET",credentials:"include",headers:{Accept:"application/json"},cache:"no-store"});if(response.status===401){STATE.user=null;return}if(!response.ok)throw new Error(`Auth check failed: ${response.status}`);const data=await response.json();if(data.ok===!0&&data.authenticated===!0&&data.user){STATE.user=data.user;return}STATE.user=null}catch(error){console.error("[Pasar UMKM] Auth session check error:",error),STATE.user=null}}async function apiRequest(endpoint,options={}){if(!CONFIG.API_BASE_URL)return null;const controller=new AbortController,timeout=window.setTimeout(()=>{controller.abort()},12e3);try{const response=await fetch(`${CONFIG.API_BASE_URL}${endpoint}`,{credentials:"include",...options,headers:{Accept:"application/json","Content-Type":"application/json",...options.headers},signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}: ${response.statusText}`);return(response.headers.get("content-type")||"").includes("application/json")?await response.json():null}finally{window.clearTimeout(timeout)}}function renderApplication(){renderStories(),renderQuickCategories(),renderFeed(),renderSidebar(),renderAccount(),updateNavigation(),updateHeaderBadges(),updateCartBadge()}function setupSplash(){if(!DOM.splash)return;if(sessionStorage.getItem(CONFIG.INTRO_KEY)){DOM.splash.hidden=!0;return}sessionStorage.setItem(CONFIG.INTRO_KEY,"1"),window.setTimeout(()=>{DOM.splash.classList.add("is-exiting"),window.setTimeout(()=>{DOM.splash.hidden=!0,DOM.splash.classList.add("is-hidden")},CONFIG.SPLASH_EXIT_DURATION)},CONFIG.SPLASH_DURATION)}function renderStories(){if(!DOM.stories||!DOM.storiesSection)return;if(DATA.stories.length===0){DOM.stories.innerHTML="",DOM.storiesSection.hidden=!0;return}DOM.storiesSection.hidden=!1;let output="";STATE.user&&(output+=`
      <button
        type="button"
        class="story-item story-add"
        data-action="add-story"
        aria-label="Tambah cerita"
      >
        <span class="story-ring">
          <i class="ph ph-plus" aria-hidden="true"></i>
        </span>

        <span class="story-name">
          Cerita Anda
        </span>
      </button>
    `),output+=DATA.stories.map(createStoryTemplate).join(""),DOM.stories.innerHTML=output}function createStoryTemplate(story){return`
    <button
      type="button"
      class="story-item ${story.unread?"has-update":""}"
      data-action="open-story"
      data-story-id="${escapeHTML(story.id)}"
      aria-label="Lihat cerita ${escapeHTML(story.name)}"
    >
      <span class="story-ring">
        <img
          class="story-avatar"
          src="${escapeHTML(story.avatar||ASSETS.logo)}"
          alt=""
          loading="lazy"
          decoding="async"
        >
      </span>

      <span class="story-name">
        ${escapeHTML(story.name||"UMKM")}
      </span>
    </button>
  `}function renderQuickCategories(){if(!DOM.quickCategories)return;const homepageCategories=CATEGORIES.filter(category=>category.home).slice(0,4);DOM.quickCategories.innerHTML=homepageCategories.map(createCategoryCard).join("")}function createCategoryCard(category){return`
    <button
      type="button"
      class="quick-category"
      data-action="category"
      data-category-id="${escapeHTML(category.id)}"
      aria-label="Buka kategori ${escapeHTML(category.name)}"
    >
      <span class="quick-category-icon">
        <i
          class="ph ph-${escapeHTML(category.icon)}"
          aria-hidden="true"
        ></i>
      </span>

      <span class="quick-category-label">
        ${escapeHTML(category.name)}
      </span>
    </button>
  `}function openAllCategories(){const categories=CATEGORIES.map(category=>`
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="category"
          data-category-id="${escapeHTML(category.id)}"
        >
          <i
            class="ph ph-${escapeHTML(category.icon)}"
            aria-hidden="true"
          ></i>

          <span>
            ${escapeHTML(category.name)}
          </span>
        </button>
      `).join("");openBottomSheet(`
      <h2 id="sheetTitle">
        Semua Kategori
      </h2>

      ${categories}
    `,"categories")}function openCategory(categoryId){const category=CATEGORIES.find(item=>item.id===categoryId);if(!category)return;STATE.activeCategory=category.id,STATE.activeNav="categories",closeBottomSheet(),updateNavigation();const posts=DATA.posts.filter(post=>normalizeText(post.product?.category)===normalizeText(category.name)||normalizeText(post.product?.categoryId)===normalizeText(category.id));renderFeed(posts,category),window.scrollTo({top:0,behavior:"smooth"})}function renderFeed(posts=getVisiblePosts(),category=null){if(!DOM.feed)return;if(!posts.length){DOM.feed.innerHTML=createEmptyFeedTemplate(category);return}const eyebrow=category?"KATEGORI":"PASAR HARI INI",title=category?category.name:"Terbaru dari UMKM",description=category?`Pilihan produk ${category.name} dari UMKM lokal.`:"Produk dan cerita terbaru dari pelaku usaha lokal.";DOM.feed.innerHTML=`
    <header class="market-feed-head">

      <div class="market-feed-head-copy">

        <span class="market-feed-eyebrow">
          ${escapeHTML(eyebrow)}
        </span>

        <h2 class="market-feed-title">
          ${escapeHTML(title)}
        </h2>

        <p class="market-feed-description">
          ${escapeHTML(description)}
        </p>

      </div>


      <div
        class="market-feed-mark"
        aria-hidden="true"
      >
        <span></span>
      </div>

    </header>


    ${posts.map(createPostTemplate).join("")}
  `}function createEmptyFeedTemplate(category=null){return category?`
      <section class="empty-state">
        <i
          class="ph ph-package"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Belum ada produk ${escapeHTML(category.name)}
        </strong>

        <p class="empty-state-text">
          Produk dari kategori ini akan muncul setelah
          UMKM mulai mempublikasikannya.
        </p>

        <button
          type="button"
          class="btn-primary"
          data-nav="home"
        >
          Kembali ke Beranda
        </button>
      </section>
    `:`
    <section class="empty-state">
      <i
        class="ph ph-storefront"
        aria-hidden="true"
      ></i>

      <strong class="empty-state-title">
        Belum ada postingan
      </strong>

      <p class="empty-state-text">
        Produk dan aktivitas UMKM Lubuklinggau akan
        tampil di sini setelah mulai dipublikasikan.
      </p>

      <button
        type="button"
        class="btn-primary"
        data-action="sell"
      >
        Mulai Jual
      </button>
    </section>
  `}function createPostTemplate(post){const postId=String(post.id||""),liked=STATE.likedPosts.has(postId),saved=STATE.savedPosts.has(postId),isProductPost=!!post.product,actionLikeCount=Number(post.likesCount||post.likes||0)+(liked?1:0),actionCommentCount=Number(post.commentsCount||post.comments||0);return`
    <article
      class="post-card ${isProductPost?"is-product-post":""}"
      id="post-${escapeHTML(postId)}"
      data-post-id="${escapeHTML(postId)}"
    >

      ${createPostHeader(post)}


      ${isProductPost?`
              <div class="ig-product-media">

                <img
                  src="${escapeHTML(post.product.image||ASSETS.logo)}"
                  alt="${escapeHTML(post.product.name||"Produk UMKM")}"
                  loading="lazy"
                  decoding="async"
                >

              </div>
            `:createPostMedia(post)}


      <div class="post-actions">

        <div class="actions-left">

          <button
  type="button"
  class="action-btn action-btn-count ${liked?"liked":""}"
  data-action="like"
  data-post-id="${escapeHTML(postId)}"
  aria-label="Sukai postingan"
  aria-pressed="${liked}"
>
  <i
    class="${liked?"ph-fill":"ph"} ph-heart"
  ></i>

  <span class="action-count">
    ${formatCompactNumber(actionLikeCount)}
  </span>
</button>

          <button
  type="button"
  class="action-btn action-btn-count"
  data-action="comments"
  data-post-id="${escapeHTML(postId)}"
  aria-label="Komentar"
>
  <i class="ph ph-chat-circle"></i>

  <span class="action-count">
    ${formatCompactNumber(actionCommentCount)}
  </span>
</button>


          <button
            type="button"
            class="action-btn"
            data-action="share"
            data-post-id="${escapeHTML(postId)}"
            aria-label="Bagikan"
          >
            <i class="ph ph-paper-plane-tilt"></i>
          </button>

        </div>


        <button
          type="button"
          class="action-btn ${saved?"saved":""}"
          data-action="save"
          data-post-id="${escapeHTML(postId)}"
          aria-label="Simpan"
          aria-pressed="${saved}"
        >
          <i
            class="${saved?"ph-fill":"ph"} ph-bookmark-simple"
          ></i>
        </button>

      </div>


      ${createLikeCount(post)}


      ${isProductPost?createProductTemplate(post.product,post.caption):createCaption(post)}


      ${Number(post.commentsCount||post.comments)>0?`
              <button
                type="button"
                class="view-comments"
                data-action="comments"
                data-post-id="${escapeHTML(postId)}"
              >
                Lihat ${formatCompactNumber(post.commentsCount||post.comments)} komentar
              </button>
            `:""}


    </article>
  `}function createPostHeader(post){const store=post.store||{};return`
    <header class="post-header">


      <button
        type="button"
        class="post-profile-link"
        data-action="seller-profile"
        data-store-id="${escapeHTML(store.id||"")}"
        aria-label="Lihat profil ${escapeHTML(store.name||"UMKM Lokal")}"
      >


        <img
          src="${escapeHTML(store.avatar||ASSETS.logo)}"
          alt=""
          class="post-avatar"
          loading="lazy"
          decoding="async"
        >


        <div class="post-meta">

          <div class="post-author">

            <span>
              ${escapeHTML(store.name||"UMKM Lokal")}
            </span>


            ${store.verified?`
                    <i
                      class="ph-fill ph-seal-check verified-badge"
                      aria-label="UMKM terverifikasi"
                    ></i>
                  `:""}

          </div>


          <div class="post-context">

            <span>
              ${escapeHTML(post.location||store.location||CONFIG.CITY)}
            </span>


            ${post.createdAt?`
                    <span
                      class="dot"
                      aria-hidden="true"
                    ></span>

                    <span>
                      ${formatRelativeTime(post.createdAt)}
                    </span>
                  `:""}

          </div>

        </div>


      </button>


      <button
        type="button"
        class="post-menu"
        data-action="post-menu"
        data-post-id="${escapeHTML(post.id)}"
        aria-label="Opsi postingan"
      >
        <i
          class="ph ph-dots-three"
          aria-hidden="true"
        ></i>
      </button>


    </header>
  `}function createPostMedia(post){const media=post.media;return media?media.type==="video"?`
      <div class="post-media video">

        ${media.poster?`
              <img
                src="${escapeHTML(media.poster)}"
                alt="${escapeHTML(media.alt||"")}"
                loading="lazy"
                decoding="async"
              >
            `:""}

        <span class="video-indicator">
          <i
            class="ph-fill ph-play"
            aria-hidden="true"
          ></i>
          VIDEO
        </span>

        <button
          type="button"
          class="play-button"
          data-action="play-video"
          data-post-id="${escapeHTML(post.id)}"
          aria-label="Putar video"
        ></button>

      </div>
    `:media.src?`
    <div
      class="post-media ${media.aspect==="square"?"square":""}"
    >
      <img
        src="${escapeHTML(media.src)}"
        alt="${escapeHTML(media.alt||"")}"
        loading="lazy"
        decoding="async"
      >
    </div>
  `:"":""}function createCaption(post){return post.caption?`
    <div class="post-caption">

      <span class="author">
        ${escapeHTML(post.store?.name||"UMKM Lokal")}
      </span>

      ${escapeHTML(post.caption)}

    </div>
  `:""}function createLikeCount(post){const postId=String(post.id||""),serverLikes=Number(post.likesCount||post.likes||0),locallyLiked=STATE.likedPosts.has(postId),count=serverLikes+(locallyLiked?1:0);return count<=0?"":`
    <div class="post-stats">
      ${formatCompactNumber(count)} suka
    </div>
  `}function createProductTemplate(product,caption=""){return`
    <section
      class="ig-product-info"
      data-product-id="${escapeHTML(product.id||"")}"
    >

      <div class="ig-product-meta">

        ${product.category?`
                <span class="ig-product-category">
                  ${escapeHTML(product.category)}
                </span>
              `:"<span></span>"}


        <span class="ig-product-stock">
          Stok ${escapeHTML(String(product.stock??0))}

          ${product.unit?` ${escapeHTML(product.unit)}`:""}
        </span>

      </div>


      <h3 class="ig-product-name">
        ${escapeHTML(product.name||"Produk UMKM")}
      </h3>


      <div class="ig-product-price">
        ${formatRupiah(product.price)}
      </div>


      ${caption?`
              <p class="ig-product-description">
                ${escapeHTML(caption)}
              </p>
            `:""}


      <div class="ig-product-buttons">

        <button
          type="button"
          class="ig-cart-button"
          data-action="add-cart"
          data-product-id="${escapeHTML(product.id||"")}"
        >

          <i
            class="ph ph-shopping-cart-simple"
            aria-hidden="true"
          ></i>

          <span>
            Keranjang
          </span>

        </button>


        <button
          type="button"
          class="ig-buy-button"
          data-action="buy-now"
          data-product-id="${escapeHTML(product.id||"")}"
        >

          <i
            class="ph ph-shopping-bag"
            aria-hidden="true"
          ></i>

          <span>
            Beli Sekarang
          </span>

        </button>

      </div>

    </section>
  `}function bindEvents(){document.addEventListener("click",handleDocumentClick),document.addEventListener("click",handleMediaDoubleTap),document.addEventListener("keydown",handleKeyboard),window.addEventListener("scroll",handleScroll,{passive:!0}),DOM.searchInput?.addEventListener("input",handleSearchInput),DOM.searchClearButton?.addEventListener("click",clearSearch)}function handleDocumentClick(event){const navButton=event.target.closest("[data-nav]");if(navButton){navigate(navButton.dataset.nav);return}const actionButton=event.target.closest("[data-action]");if(actionButton){runAction(actionButton.dataset.action,actionButton);return}const menuAction=event.target.closest("[data-menu-action]");if(menuAction){runMenuAction(menuAction.dataset.menuAction);return}DOM.sideMenu&&STATE.menuOpen&&event.target===DOM.sideMenu&&closeSideMenu(),DOM.sheetOverlay&&event.target===DOM.sheetOverlay&&closeBottomSheet()}function runAction(action,element){const postId=element.dataset.postId,productId=element.dataset.productId;switch(action){case"menu":openSideMenu();break;case"account-post-open":openAccountPostViewer(postId);break;case"close-menu":closeSideMenu();break;case"search":openSearch();break;case"close-search":closeSearch();break;case"notifications":openNotifications();break;case"messages":openMessages();break;case"category":case"quick-category":openCategory(element.dataset.categoryId||findCategoryIdByName(element.dataset.category));break;case"all-categories":openAllCategories();break;case"like":toggleLike(postId);break;case"save":toggleSave(postId);break;case"comments":openComments(postId);break;case"comment-submit":submitComment(postId,element);break;case"comment-emoji":insertCommentEmoji(element);break;case"comment-reply":startCommentReply(postId,element.dataset.commentId,element.dataset.commentName,element);break;case"comment-reply-cancel":cancelCommentReply(element);break;case"comment-replies-toggle":toggleCommentReplies(element);break;case"comment-delete":deleteComment(postId,element.dataset.commentId,element);break;case"share":sharePost(postId);break;case"post-menu":openPostMenu(postId);break;case"delete-post":openPostDeleteConfirm(postId);break;case"delete-post-confirm":deletePost(postId,element);break;case"product-detail":openProductDetail(productId);break;case"product-edit":openProductEditForm(productId);break;case"product-edit-save":handleProductEditSave(productId,element);break;case"product-delete-confirm":openProductDeleteConfirm(productId);break;case"product-delete":handleProductDelete(productId,element);break;case"add-cart":addToCart(productId);break;case"buy-now":buyNow(productId);break;case"cart-increase":changeCartQuantity(productId,1);break;case"cart-decrease":changeCartQuantity(productId,-1);break;case"remove-cart":removeFromCart(productId);break;case"clear-cart":clearCart();break;case"checkout":checkout();break;case"store-detail":openStoreDetail(element.dataset.storeId);break;case"seller-profile":openSellerProfile(element.dataset.storeId);break;case"seller-follow":handleSellerFollow(element.dataset.storeId);break;case"seller-share":shareSellerProfile(element.dataset.storeId);break;case"seller-message":openSellerMessage(element.dataset.storeId);break;case"seller-contact":openSellerContact(element.dataset.storeId);break;case"seller-profile-back":navigate("home");break;case"seller-suggest":openSimilarStores(element.dataset.storeId);break;case"seller-public-tab":switchPublicSellerTab(element.dataset.storeId,element.dataset.tab,element);break;case"seller-post-open":openSellerPostViewer(element.dataset.storeId,postId);break;case"login":openLogin();break;case"logout":logout();break;case"sell":openSell();break;case"product-create":openProductCreateForm();break;case"post-create":openPostCreateInfo();break;case"open-story":openStory(element.dataset.storyId);break;case"add-story":openAddStory();break;case"search-post":closeSearch(),scrollToPost(postId);break;case"notification-item":openNotificationTarget(element.dataset.notificationId);break;case"mark-all-read":markAllNotificationsRead();break;case"message-item":openMessage(element.dataset.messageId);break;case"account-menu":openAccountMenu();break;case"account-edit":openAccountEditInfo();break;case"account-share":shareAccountProfile();break;case"account-tab":switchAccountTab(element.dataset.tab,element);break;case"account-logout":logoutFromAccount();break;case"close-sheet":closeBottomSheet();break;default:break}}function getCurrentStorePostsOnly(){const storeId=String(STATE.currentStore?.id||"");return storeId?DATA.posts.filter(post=>!post.product&&String(post.store?.id||"")===storeId):[]}function openAccountPostViewer(selectedPostId){const posts=getCurrentStorePostsOnly();if(!posts.length||!DOM.feed){showToast("Postingan belum tersedia.");return}const selectedIndex=posts.findIndex(post=>String(post.id)===String(selectedPostId)),orderedPosts=selectedIndex>=0?posts.slice(selectedIndex):posts;STATE.activeNav="account",updateNavigation(),document.querySelector(".app")?.classList.add("account-profile-active"),DOM.storiesSection&&(DOM.storiesSection.hidden=!0),DOM.homeDiscovery&&(DOM.homeDiscovery.hidden=!0),DOM.feed.innerHTML=`
    <section class="post-viewer-page">

      <header class="post-viewer-header">

        <button
          type="button"
          class="post-viewer-back"
          data-nav="account"
          aria-label="Kembali ke profil"
        >
          <i class="ph ph-arrow-left"></i>
        </button>


        <div class="post-viewer-header-copy">

          <strong>
            Postingan
          </strong>

          <span>
            ${orderedPosts.length}
            postingan
          </span>

        </div>

      </header>


      <div class="post-viewer-list">

        ${orderedPosts.map(post=>`
            <div
              class="post-viewer-item"
              data-viewer-post-id="${escapeHTML(post.id||"")}"
            >
              ${createPostTemplate(post)}
            </div>
          `).join("")}

      </div>

    </section>
  `,window.scrollTo({top:0,behavior:"auto"})}function openSellerPostViewer(storeId,selectedPostId){if(storeId=String(storeId||""),selectedPostId=String(selectedPostId||""),!storeId||!DOM.feed){showToast("Postingan tidak tersedia.");return}const store=getStores().find(item=>String(item.id)===storeId),posts=DATA.posts.filter(post=>!post.product&&String(post.store?.id||"")===storeId);if(!posts.length){showToast("UMKM ini belum memiliki postingan.");return}const selectedIndex=posts.findIndex(post=>String(post.id)===selectedPostId),orderedPosts=selectedIndex>=0?posts.slice(selectedIndex):posts;STATE.activeNav="home",updateNavigation(),document.querySelector(".app")?.classList.add("account-profile-active"),DOM.storiesSection&&(DOM.storiesSection.hidden=!0),DOM.homeDiscovery&&(DOM.homeDiscovery.hidden=!0),DOM.feed.innerHTML=`
    <section
      class="
        post-viewer-page
        public-seller-post-viewer
      "
      data-store-id="${escapeHTML(storeId)}"
    >

      <header class="post-viewer-header">

        <button
          type="button"
          class="post-viewer-back"
          data-action="seller-profile"
          data-store-id="${escapeHTML(storeId)}"
          aria-label="Kembali ke profil UMKM"
        >
          <i class="ph ph-arrow-left"></i>
        </button>


        <div class="post-viewer-header-copy">

          <strong>
            Postingan
          </strong>

          <span>
            ${escapeHTML(store?.name||"UMKM Lokal")}
          </span>

        </div>

      </header>


      <div class="post-viewer-list">

        ${orderedPosts.map(post=>`
            <div
              class="post-viewer-item"
              data-viewer-post-id="${escapeHTML(post.id||"")}"
            >
              ${createPostTemplate(post)}
            </div>
          `).join("")}

      </div>

    </section>
  `,window.scrollTo({top:0,behavior:"auto"})}function runMenuAction(action){switch(closeSideMenu(),action){case"home":navigate("home");break;case"categories":openAllCategories();break;case"stores":openStores();break;case"orders":openOrders();break;case"favorites":openFavorites();break;case"about":openAbout();break;case"help":openHelp();break;case"store":openSellerStore();break;case"seller-products":openSellerProducts();break;case"admin":openAdmin();break;default:break}}function navigate(target){switch(target!=="account"&&typeof leaveAccountProfile=="function"&&leaveAccountProfile(),STATE.activeNav=target,closeSideMenu(),target){case"home":STATE.activeCategory=null,renderFeed(),window.scrollTo({top:0,behavior:"smooth"});break;case"categories":openAllCategories();break;case"sell":openSell();break;case"cart":openCart();break;case"account":openAccount();break;default:break}updateNavigation()}function updateNavigation(){DOM.navigation&&DOM.navigation.querySelectorAll("[data-nav]").forEach(button=>{const isActive=button.dataset.nav===STATE.activeNav;button.classList.toggle("active",isActive),isActive?button.setAttribute("aria-current","page"):button.removeAttribute("aria-current")})}function toggleLike(postId){postId=String(postId||""),postId&&(STATE.likedPosts.has(postId)?STATE.likedPosts.delete(postId):STATE.likedPosts.add(postId),saveLocalState(),refreshPostInteractionUI(postId))}let lastMediaTapPostId="",lastMediaTapTime=0;function handleMediaDoubleTap(event){const media=event.target.closest(".post-card .ig-product-media, .post-card .post-media:not(.video)");if(!media)return;const card=media.closest(".post-card[data-post-id]");if(!card)return;const postId=String(card.dataset.postId||"");if(!postId)return;const now=Date.now(),isDoubleTap=lastMediaTapPostId===postId&&now-lastMediaTapTime<=320;lastMediaTapPostId=postId,lastMediaTapTime=now,isDoubleTap&&(lastMediaTapPostId="",lastMediaTapTime=0,STATE.likedPosts.has(postId)||(STATE.likedPosts.add(postId),saveLocalState(),refreshPostInteractionUI(postId)),showMediaLikeBurst(media))}function showMediaLikeBurst(media){media.querySelector(".media-like-burst")?.remove();const burst=document.createElement("span");burst.className="media-like-burst",burst.innerHTML=`
    <i
      class="ph-fill ph-heart"
      aria-hidden="true"
    ></i>
  `,media.appendChild(burst),requestAnimationFrame(()=>{burst.classList.add("show")}),window.setTimeout(()=>{burst.remove()},650)}function toggleSave(postId){postId=String(postId||""),postId&&(STATE.savedPosts.has(postId)?(STATE.savedPosts.delete(postId),showToast("Dihapus dari favorit.")):(STATE.savedPosts.add(postId),showToast("Disimpan ke favorit.")),saveLocalState(),refreshPostInteractionUI(postId))}function refreshPostInteractionUI(postId){if(postId=String(postId||""),!postId)return;const post=findPost(postId);if(!post)return;const liked=STATE.likedPosts.has(postId),saved=STATE.savedPosts.has(postId),likeCount=Number(post.likesCount||post.likes||0)+(liked?1:0);document.querySelectorAll(".post-card[data-post-id]").forEach(card=>{if(String(card.dataset.postId||"")!==postId)return;const likeButton=card.querySelector('[data-action="like"]');if(likeButton){likeButton.classList.toggle("liked",liked),likeButton.setAttribute("aria-pressed",String(liked));const icon=likeButton.querySelector("i");icon&&(icon.classList.toggle("ph-fill",liked),icon.classList.toggle("ph",!liked));const countElement=likeButton.querySelector(".action-count");countElement&&(countElement.textContent=formatCompactNumber(likeCount))}const saveButton=card.querySelector('[data-action="save"]');if(saveButton){saveButton.classList.toggle("saved",saved),saveButton.setAttribute("aria-pressed",String(saved));const icon=saveButton.querySelector("i");icon&&(icon.classList.toggle("ph-fill",saved),icon.classList.toggle("ph",!saved))}let stats=card.querySelector(".post-stats");if(likeCount>0){if(!stats){stats=document.createElement("div"),stats.className="post-stats";const actions=card.querySelector(".post-actions");actions&&actions.insertAdjacentElement("afterend",stats)}stats.textContent=`${formatCompactNumber(likeCount)} suka`}else stats&&stats.remove()})}function renderCommentText(content){let output=escapeHTML(String(content||""));return Object.entries({"\u2764\uFE0F":"2764","\u{1F64C}":"1f64c","\u{1F525}":"1f525","\u{1F44F}":"1f44f","\u{1F979}":"1f979","\u{1F60D}":"1f60d","\u{1F602}":"1f602"}).forEach(([emoji,code])=>{const image=`
        <img
          class="comment-inline-emoji"
          src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${code}.svg"
          alt="${emoji}"
          draggable="false"
        >
      `;output=output.split(emoji).join(image)}),output}async function openComments(postId){const post=findPost(postId);if(!post){showToast("Postingan tidak ditemukan.");return}const isProductComment=!!post.product,backendCommentId=String(isProductComment?post.product?.id:post.backendId||post.id||"").replace(/^post-/,"").replace(/^product-/,"").trim();if(!backendCommentId){showToast(isProductComment?"ID produk tidak valid.":"ID postingan tidak valid.");return}const commentsEndpoint=isProductComment?`/api/products/${encodeURIComponent(backendCommentId)}/comments`:`/api/posts/${encodeURIComponent(backendCommentId)}/comments`;openBottomSheet(`
      <h2 id="sheetTitle">
        Komentar
      </h2>

      <section class="empty-state">

        <i
          class="ph ph-spinner-gap"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Memuat komentar...
        </strong>

      </section>
    `,"comments");try{let renderSingleComment=function(comment,options={}){const isReply=!!options.isReply,avatar=comment.user_avatar||ASSETS.logo,canDeleteComment=!!(STATE.user&&(String(comment.user_id||"")===String(STATE.user.id||"")||STATE.user.role==="admin")),commentName=String(comment.user_name||"Pengguna");return`
        <article
          class="
            post-comment-item
            ${isReply?"is-reply":""}
          "
          data-comment-id="${escapeHTML(comment.id||"")}"
        >

          <img
            class="post-comment-avatar"
            src="${escapeHTML(avatar)}"
            alt=""
            loading="lazy"
            decoding="async"
          >


       <div class="post-comment-body">

  <div class="post-comment-headline">

    <strong class="post-comment-name">
      ${escapeHTML(commentName)}
    </strong>

    <span class="post-comment-time">
      ${formatRelativeTime(comment.created_at)}
    </span>

  </div>

  <p class="post-comment-text">
    ${renderCommentText(comment.content||"")}
  </p>

  ${STATE.user?`
          <div class="post-comment-actions">

            <button
              type="button"
              class="post-comment-reply-button"
              data-action="comment-reply"
              data-post-id="${escapeHTML(post.id||"")}"
              data-comment-id="${escapeHTML(comment.id||"")}"
              data-comment-name="${escapeHTML(commentName)}"
            >
              Balas
            </button>

          </div>
        `:""}

</div>

          ${canDeleteComment?`
                  <button
                    type="button"
                    class="post-comment-delete"
                    data-action="comment-delete"
                    data-post-id="${escapeHTML(post.id||"")}"
                    data-comment-id="${escapeHTML(comment.id||"")}"
                    aria-label="Hapus komentar"
                  >
                    <i
                      class="ph ph-trash"
                      aria-hidden="true"
                    ></i>
                  </button>
                `:""}

        </article>
      `};const response=await fetch(commentsEndpoint,{method:"GET",credentials:"include",headers:{Accept:"application/json"},cache:"no-store"}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||"Gagal memuat komentar.");const comments=Array.isArray(data.comments)?data.comments:[];post.commentsCount=comments.length,document.querySelectorAll(".post-card[data-post-id]").forEach(card=>{if(String(card.dataset.postId||"")!==String(postId))return;const count=card.querySelector('[data-action="comments"] .action-count');count&&(count.textContent=formatCompactNumber(comments.length))});const rootComments=comments.filter(comment=>!comment.parent_comment_id),repliesByParent=new Map;comments.forEach(comment=>{const parentId=String(comment.parent_comment_id||"").trim();parentId&&(repliesByParent.has(parentId)||repliesByParent.set(parentId,[]),repliesByParent.get(parentId).push(comment))});const commentsHTML=rootComments.length?rootComments.map(comment=>{const replies=repliesByParent.get(String(comment.id||""))||[],repliesHTML=replies.map(reply=>renderSingleComment(reply,{isReply:!0})).join("");return`
                <section
                  class="post-comment-thread"
                  data-thread-id="${escapeHTML(comment.id||"")}"
                >

                  ${renderSingleComment(comment)}


                  ${replies.length?`
                          <button
                            type="button"
                            class="post-comment-replies-toggle"
                            data-action="comment-replies-toggle"
                            data-reply-count="${replies.length}"
                          >
                            <span
                              class="post-comment-replies-line"
                              aria-hidden="true"
                            ></span>

                            <span>
                              Lihat ${formatCompactNumber(replies.length)} balasan
                            </span>
                          </button>


                          <div
                            class="post-comment-replies"
                            hidden
                          >
                            ${repliesHTML}
                          </div>
                        `:""}

                </section>
              `}).join(""):`
            <section
              class="empty-state"
            >

              <i
                class="ph ph-chat-circle"
                aria-hidden="true"
              ></i>

              <strong
                class="empty-state-title"
              >
                Belum ada komentar
              </strong>

              <p
                class="empty-state-text"
              >
                Jadilah yang pertama memberikan komentar.
              </p>

            </section>
          `;openBottomSheet(`
        <div
          class="post-comments-sheet"
          data-post-id="${escapeHTML(post.id||"")}"
        >

          <h2 id="sheetTitle">
            Komentar
          </h2>


          <div class="post-comments-list">
            ${commentsHTML}
          </div>
${STATE.user?`
        <div class="post-comment-footer">

          <div
            class="post-comment-reactions"
            aria-label="Emoji cepat"
          >

                       <button
              type="button"
              class="comment-emoji-btn"
              data-action="comment-emoji"
              data-emoji="\u2764\uFE0F"
              aria-label="Hati"
            >
              <img
                class="comment-emoji-image"
                src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/2764.svg"
                alt=""
                aria-hidden="true"
              >
            </button>

            <button
              type="button"
              class="comment-emoji-btn"
              data-action="comment-emoji"
              data-emoji="\u{1F64C}"
              aria-label="Angkat tangan"
            >
              <img
                class="comment-emoji-image"
                src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f64c.svg"
                alt=""
                aria-hidden="true"
              >
            </button>

            <button
              type="button"
              class="comment-emoji-btn"
              data-action="comment-emoji"
              data-emoji="\u{1F525}"
              aria-label="Api"
            >
              <img
                class="comment-emoji-image"
                src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f525.svg"
                alt=""
                aria-hidden="true"
              >
            </button>

            <button
              type="button"
              class="comment-emoji-btn"
              data-action="comment-emoji"
              data-emoji="\u{1F44F}"
              aria-label="Tepuk tangan"
            >
              <img
                class="comment-emoji-image"
                src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f44f.svg"
                alt=""
                aria-hidden="true"
              >
            </button>

            <button
              type="button"
              class="comment-emoji-btn"
              data-action="comment-emoji"
              data-emoji="\u{1F979}"
              aria-label="Terharu"
            >
              <img
                class="comment-emoji-image"
                src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f979.svg"
                alt=""
                aria-hidden="true"
              >
            </button>

            <button
              type="button"
              class="comment-emoji-btn"
              data-action="comment-emoji"
              data-emoji="\u{1F60D}"
              aria-label="Mata hati"
            >
              <img
                class="comment-emoji-image"
                src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f60d.svg"
                alt=""
                aria-hidden="true"
              >
            </button>

            <button
              type="button"
              class="comment-emoji-btn"
              data-action="comment-emoji"
              data-emoji="\u{1F602}"
              aria-label="Tertawa"
            >
              <img
                class="comment-emoji-image"
                src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f602.svg"
                alt=""
                aria-hidden="true"
              >
            </button>
          </div>

          <div
  class="post-comment-reply-bar"
  hidden
>
  <div class="post-comment-reply-info">

    <span>
      Membalas
    </span>

    <strong
      class="post-comment-reply-name"
    ></strong>

  </div>

  <button
    type="button"
    class="post-comment-reply-cancel"
    data-action="comment-reply-cancel"
    aria-label="Batal membalas"
  >
    <i
      class="ph ph-x"
      aria-hidden="true"
    ></i>
  </button>
</div>


          <div class="post-comment-compose">
          <img
              class="post-comment-own-avatar"
              src="${escapeHTML(STATE.user.avatar_url||ASSETS.logo)}"
              alt=""
            >


            <div class="post-comment-input-shell">

              <textarea
                class="post-comment-input"
                maxlength="500"
                rows="1"
                placeholder="Tambahkan komentar..."
                aria-label="Tambahkan komentar"
              ></textarea>


              <button
                type="button"
                class="post-comment-send"
                data-action="comment-submit"
                data-post-id="${escapeHTML(post.id||"")}"
                aria-label="Kirim komentar"
              >
                <i
                  class="ph ph-paper-plane-tilt"
                  aria-hidden="true"
                ></i>
              </button>

            </div>

          </div>

        </div>
      `:`
        <button
          type="button"
          class="btn-primary"
          data-action="login"
        >
          Masuk untuk berkomentar
        </button>
      `}
        </div>
      `,"comments")}catch(error){console.error("[Pasar UMKM] Comments load error:",error),openBottomSheet(`
        <h2 id="sheetTitle">
          Komentar
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-warning-circle"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Komentar gagal dimuat
          </strong>

          <p class="empty-state-text">
            Coba buka kembali beberapa saat lagi.
          </p>

        </section>
      `,"comments")}}function startCommentReply(postId,commentId,commentName,element){const sheet=element.closest(".post-comments-sheet");if(!sheet||(commentId=String(commentId||"").trim(),commentName=String(commentName||"Pengguna").trim(),!commentId))return;sheet.dataset.replyTo=commentId,sheet.dataset.replyName=commentName;const replyBar=sheet.querySelector(".post-comment-reply-bar"),replyName=sheet.querySelector(".post-comment-reply-name"),input=sheet.querySelector(".post-comment-input");replyBar&&(replyBar.hidden=!1),replyName&&(replyName.textContent=`@${commentName}`),input&&(input.placeholder=`Balas @${commentName}...`,input.focus())}function cancelCommentReply(element){const sheet=element.closest(".post-comments-sheet");if(!sheet)return;delete sheet.dataset.replyTo,delete sheet.dataset.replyName;const replyBar=sheet.querySelector(".post-comment-reply-bar"),input=sheet.querySelector(".post-comment-input");replyBar&&(replyBar.hidden=!0),input&&(input.placeholder="Tambahkan komentar...",input.focus())}function toggleCommentReplies(element){const thread=element.closest(".post-comment-thread");if(!thread)return;const replies=thread.querySelector(".post-comment-replies");if(!replies)return;const isHidden=replies.hidden;replies.hidden=!isHidden;const count=Number(element.dataset.replyCount||0),label=element.querySelector("span:last-child");label&&(label.textContent=isHidden?"Sembunyikan balasan":`Lihat ${count} balasan`)}function insertCommentEmoji(element){const emoji=String(element.dataset.emoji||"");if(!emoji)return;const input=element.closest(".post-comments-sheet")?.querySelector(".post-comment-input");if(!input)return;const start=input.selectionStart??input.value.length,end=input.selectionEnd??input.value.length;input.setRangeText(emoji,start,end,"end"),input.focus()}async function submitComment(postId,element){const post=findPost(postId);if(!post){showToast("Postingan tidak ditemukan.");return}if(!STATE.user){openLogin();return}const sheet=element.closest(".post-comments-sheet"),input=sheet?.querySelector(".post-comment-input"),content=String(input?.value||"").trim();if(!content){showToast("Tulis komentar terlebih dahulu."),input?.focus();return}if(content.length>500){showToast("Komentar maksimal 500 karakter.");return}const isProductComment=!!post.product,backendCommentId=String(isProductComment?post.product?.id:post.backendId||post.id||"").replace(/^post-/,"").replace(/^product-/,"").trim();if(!backendCommentId){showToast(isProductComment?"ID produk tidak valid.":"ID postingan tidak valid.");return}const commentsEndpoint=isProductComment?`/api/products/${encodeURIComponent(backendCommentId)}/comments`:`/api/posts/${encodeURIComponent(backendCommentId)}/comments`,oldText=element.textContent;element.disabled=!0,element.textContent="Mengirim...",input&&(input.disabled=!0);try{const response=await fetch(commentsEndpoint,{method:"POST",credentials:"include",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify({content,parent_comment_id:String(sheet?.dataset.replyTo||"").trim()||null})}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||"Gagal mengirim komentar.");showToast("Komentar berhasil dikirim."),await openComments(postId)}catch(error){console.error("[Pasar UMKM] Comment submit error:",error),showToast(error.message||"Gagal mengirim komentar."),element.disabled=!1,element.textContent=oldText,input&&(input.disabled=!1,input.focus())}}async function deleteComment(postId,commentId,element){if(commentId=String(commentId||"").trim(),!commentId){showToast("ID komentar tidak valid.");return}if(!STATE.user){openLogin();return}const post=findPost(postId);if(!post){showToast("Postingan tidak ditemukan.");return}const deleteCommentEndpoint=!!post.product?`/api/product-comments/${encodeURIComponent(commentId)}`:`/api/comments/${encodeURIComponent(commentId)}`;if(!window.confirm("Hapus komentar ini?"))return;const oldHTML=element.innerHTML;element.disabled=!0,element.innerHTML=`
    <i
      class="ph ph-spinner-gap"
      aria-hidden="true"
    ></i>
  `;try{const response=await fetch(deleteCommentEndpoint,{method:"DELETE",credentials:"include",headers:{Accept:"application/json"}}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||"Gagal menghapus komentar.");showToast("Komentar berhasil dihapus."),await openComments(postId)}catch(error){console.error("[Pasar UMKM] Comment delete error:",error),showToast(error.message||"Gagal menghapus komentar."),element.disabled=!1,element.innerHTML=oldHTML}}async function sharePost(postId){const post=findPost(postId);if(!post)return;const url=`${window.location.origin}${window.location.pathname}#post-${encodeURIComponent(postId)}`;try{if(navigator.share){await navigator.share({title:post.product?.name||CONFIG.APP_NAME,text:post.caption||"",url});return}await navigator.clipboard.writeText(url),showToast("Tautan berhasil disalin.")}catch(error){error.name!=="AbortError"&&console.error(error)}}function openPostMenu(postId){const post=findPost(postId);if(!post)return;const deleteButton=!post.product&&STATE.currentStore?.id&&String(post.store?.id||"")===String(STATE.currentStore.id)?`
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="delete-post"
          data-post-id="${escapeHTML(postId)}"
        >
          <i class="ph ph-trash"></i>
          Hapus postingan
        </button>
      `:"";openBottomSheet(`
      <h2 id="sheetTitle">
        Opsi Postingan
      </h2>

      <button
        type="button"
        class="menu-sheet-btn"
        data-action="save"
        data-post-id="${escapeHTML(postId)}"
      >
        <i class="ph ph-bookmark-simple"></i>
        Simpan postingan
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
        data-action="share"
        data-post-id="${escapeHTML(postId)}"
      >
        <i class="ph ph-share-network"></i>
        Bagikan
      </button>

      ${deleteButton}
    `,"post-menu")}function openPostDeleteConfirm(postId){const post=findPost(postId);if(!post||post.product){showToast("Postingan tidak ditemukan.");return}if(!(STATE.currentStore?.id&&String(post.store?.id||"")===String(STATE.currentStore.id))){showToast("Kamu tidak memiliki izin menghapus postingan ini.");return}const image=post.media?.src||ASSETS.logo,caption=post.caption||"Postingan UMKM";openBottomSheet(`
      <section class="post-delete-sheet">

        <div class="post-delete-icon">
          <i class="ph ph-trash"></i>
        </div>

        <div class="post-delete-heading">

          <span class="post-delete-eyebrow">
            HAPUS POSTINGAN
          </span>

          <h2 id="sheetTitle">
            Hapus postingan ini?
          </h2>

          <p>
            Postingan akan dihapus dari profil
            dan tidak lagi muncul di feed Pasar UMKM.
          </p>

        </div>

        <div class="post-delete-preview">

          <div class="post-delete-preview-image">
            <img
              src="${escapeHTML(image)}"
              alt=""
            >
          </div>

          <div class="post-delete-preview-copy">

            <strong>
              ${escapeHTML(post.store?.name||"UMKM")}
            </strong>

            <p>
              ${escapeHTML(caption)}
            </p>

          </div>

        </div>

        <div class="post-delete-note">

          <i class="ph ph-info"></i>

          <span>
            Data dinonaktifkan dari sistem dan
            tidak langsung dihapus permanen.
          </span>

        </div>

        <div class="post-delete-actions">

          <button
            type="button"
            class="post-delete-cancel"
            data-action="close-sheet"
          >
            Batal
          </button>

          <button
            type="button"
            class="post-delete-confirm"
            data-action="delete-post-confirm"
            data-post-id="${escapeHTML(post.id||"")}"
          >
            <i class="ph ph-trash"></i>
            <span>Hapus</span>
          </button>

        </div>

      </section>
    `,"post-delete-confirm")}async function deletePost(postId,element){const post=findPost(postId);if(!post||post.product){showToast("Postingan tidak ditemukan.");return}if(!(STATE.currentStore?.id&&String(post.store?.id||"")===String(STATE.currentStore.id))){showToast("Kamu tidak memiliki izin menghapus postingan ini.");return}const backendPostId=String(post.backendId||postId||"").replace(/^post-/,"").trim();if(!backendPostId){showToast("ID postingan tidak valid.");return}const label=element?.querySelector("span"),oldLabel=label?.textContent||"Hapus";element&&(element.disabled=!0),label&&(label.textContent="Menghapus...");try{const response=await fetch(`/api/posts/${encodeURIComponent(backendPostId)}`,{method:"DELETE",credentials:"include",headers:{Accept:"application/json"}}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||"Postingan gagal dihapus.");STATE.likedPosts.delete(String(postId)),STATE.savedPosts.delete(String(postId)),saveLocalState(),closeBottomSheet(),await loadInitialData(),STATE.activeNav==="account"?await openAccount():renderApplication(),showToast("Postingan berhasil dihapus.")}catch(error){console.error("[Pasar UMKM] Post delete error:",error),showToast(error.message||"Postingan gagal dihapus.")}finally{element&&(element.disabled=!1),label&&(label.textContent=oldLabel)}}function addToCart(productId){const product=findProduct(productId);if(!product)return;const existing=STATE.cart.find(item=>String(item.productId)===String(productId));existing?existing.quantity+=1:STATE.cart.push({productId:String(product.id),quantity:1,product:cloneData(product)}),saveLocalState(),updateCartBadge(),showToast("Ditambahkan ke keranjang.")}function buyNow(productId){addToCart(productId),openCart()}function openCart(){if(!STATE.cart.length){openBottomSheet(`
        <h2 id="sheetTitle">
          Keranjang
        </h2>

        <section class="empty-state">
          <i
            class="ph ph-shopping-cart-simple"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Keranjang masih kosong
          </strong>

          <p class="empty-state-text">
            Produk yang kamu pilih akan tersimpan di sini.
          </p>
        </section>
      `,"cart");return}const items=STATE.cart.map(createCartItemTemplate).join("");openBottomSheet(`
      <h2 id="sheetTitle">
        Keranjang
      </h2>

      ${items}

      <section class="product-card">

        <div class="product-info">
          <div class="product-badge">
            Total
          </div>

          <div class="product-price">
            ${formatRupiah(calculateCartTotal())}
          </div>
        </div>

        <button
          type="button"
          class="btn-primary"
          data-action="checkout"
        >
          Checkout
        </button>

      </section>

      <button
        type="button"
        class="menu-sheet-btn"
        data-action="clear-cart"
      >
        <i class="ph ph-trash"></i>
        Kosongkan keranjang
      </button>
    `,"cart")}function createCartItemTemplate(item){const product=item.product||findProduct(item.productId);return product?`
    <section class="product-card">

      <img
        src="${escapeHTML(product.image||ASSETS.logo)}"
        alt="${escapeHTML(product.name||"")}"
        class="product-img"
      >

      <div class="product-info">

        <div class="product-name">
          ${escapeHTML(product.name||"")}
        </div>

        <div class="product-price">
          ${formatRupiah(product.price)}
        </div>

        <div class="product-meta">
          Jumlah: ${Number(item.quantity)||1}
        </div>

      </div>


      <div class="product-actions">

        <button
          type="button"
          class="btn-icon"
          data-action="cart-increase"
          data-product-id="${escapeHTML(item.productId)}"
          aria-label="Tambah jumlah"
        >
          <i class="ph ph-plus"></i>
        </button>


        <button
          type="button"
          class="btn-icon"
          data-action="cart-decrease"
          data-product-id="${escapeHTML(item.productId)}"
          aria-label="Kurangi jumlah"
        >
          <i class="ph ph-minus"></i>
        </button>


        <button
          type="button"
          class="btn-icon"
          data-action="remove-cart"
          data-product-id="${escapeHTML(item.productId)}"
          aria-label="Hapus produk"
        >
          <i class="ph ph-trash"></i>
        </button>

      </div>

    </section>
  `:""}function changeCartQuantity(productId,delta){const item=STATE.cart.find(cartItem=>String(cartItem.productId)===String(productId));if(item){if(item.quantity+=delta,item.quantity<=0){removeFromCart(productId);return}saveLocalState(),updateCartBadge(),openCart()}}function removeFromCart(productId){STATE.cart=STATE.cart.filter(item=>String(item.productId)!==String(productId)),saveLocalState(),updateCartBadge(),openCart()}function clearCart(){STATE.cart=[],saveLocalState(),updateCartBadge(),closeBottomSheet(),showToast("Keranjang dikosongkan.")}function calculateCartTotal(){return STATE.cart.reduce((total,item)=>{const product=item.product||findProduct(item.productId);return product?total+Number(product.price||0)*Number(item.quantity||0):total},0)}function checkout(){if(!STATE.user){showToast("Masuk terlebih dahulu untuk checkout."),openLogin();return}openBottomSheet(`
      <h2 id="sheetTitle">
        Checkout
      </h2>

      <section class="empty-state">

        <i
          class="ph ph-receipt"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          ${formatRupiah(calculateCartTotal())}
        </strong>

        <p class="empty-state-text">
          Checkout akan diaktifkan setelah sistem
          pesanan dan pembayaran backend tersedia.
        </p>

      </section>
    `,"checkout")}function renderSidebar(){if(!DOM.sideMenuContent)return;let sellerItems="";(STATE.user?.role==="seller"||STATE.user?.role==="admin")&&(sellerItems=`
      <button
        type="button"
        class="menu-sheet-btn"
        data-menu-action="store"
      >
        <i class="ph ph-storefront"></i>
        Kelola Toko
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
        data-menu-action="seller-products"
      >
        <i class="ph ph-package"></i>
        Produk Saya
      </button>
    `);const adminItem=STATE.user?.role==="admin"?`
        <button
          type="button"
          class="menu-sheet-btn"
          data-menu-action="admin"
        >
          <i class="ph ph-shield-check"></i>
          Panel Pengelola
        </button>
      `:"";DOM.sideMenuContent.innerHTML=`
    <button
      type="button"
      class="menu-sheet-btn"
      data-menu-action="home"
    >
      <i class="ph ph-house"></i>
      Beranda
    </button>

    <button
      type="button"
      class="menu-sheet-btn"
      data-menu-action="categories"
    >
      <i class="ph ph-squares-four"></i>
      Semua Kategori
    </button>

    <button
      type="button"
      class="menu-sheet-btn"
      data-menu-action="stores"
    >
      <i class="ph ph-storefront"></i>
      Jelajahi UMKM
    </button>

    <button
      type="button"
      class="menu-sheet-btn"
      data-menu-action="orders"
    >
      <i class="ph ph-receipt"></i>
      Pesanan Saya
    </button>

    <button
      type="button"
      class="menu-sheet-btn"
      data-menu-action="favorites"
    >
      <i class="ph ph-heart"></i>
      Favorit
    </button>

    ${sellerItems}

    ${adminItem}

    <button
      type="button"
      class="menu-sheet-btn"
      data-menu-action="about"
    >
      <i class="ph ph-info"></i>
      Tentang Pasar UMKM
    </button>

    <button
      type="button"
      class="menu-sheet-btn"
      data-menu-action="help"
    >
      <i class="ph ph-question"></i>
      Bantuan
    </button>
  `}function openSideMenu(){DOM.sideMenu&&(renderSidebar(),renderAccount(),DOM.sideMenu.hidden=!1,DOM.sideMenu.setAttribute("aria-hidden","false"),STATE.menuOpen=!0,lockBodyScroll())}function closeSideMenu(){DOM.sideMenu&&(DOM.sideMenu.hidden=!0,DOM.sideMenu.setAttribute("aria-hidden","true"),STATE.menuOpen=!1,unlockBodyScroll())}function renderAccount(){if(!DOM.sideAccountGuest||!DOM.sideAccountUser)return;const loggedIn=!!STATE.user;DOM.sideAccountGuest.hidden=loggedIn,DOM.sideAccountUser.hidden=!loggedIn,loggedIn&&(DOM.sideAccountUserName&&(DOM.sideAccountUserName.textContent=STATE.user.name||"Pengguna"),DOM.sideAccountUserRole&&(DOM.sideAccountUserRole.textContent=formatRole(STATE.user.role)))}function openLogin(){if(closeSideMenu(),STATE.user){openAccount();return}renderAuthSheet("login")}function renderAuthSheet(mode="login"){const isRegister=mode==="register";openBottomSheet(`
      <div class="auth-shell" id="authShell">

        <section class="auth-brand">

          <div class="auth-brand-mark">
            <img
              src="${escapeHTML(ASSETS.logo)}"
              alt=""
              aria-hidden="true"
            >
          </div>

          <div
            id="sheetTitle"
            class="auth-title"
            role="heading"
            aria-level="2"
          >
            ${isRegister?"Buat akun Pasar UMKM":"Selamat datang kembali"}
          </div>

          <p class="auth-subtitle">
            ${isRegister?"Bergabung dan mulai terhubung dengan ekosistem UMKM lokal Lubuklinggau.":"Masuk untuk melanjutkan aktivitas Anda di Pasar UMKM."}
          </p>

        </section>


        <div class="auth-tabs">

          <button
            type="button"
            class="auth-tab ${isRegister?"":"active"}"
            data-auth-mode="login"
          >
            Masuk
          </button>

          <button
            type="button"
            class="auth-tab ${isRegister?"active":""}"
            data-auth-mode="register"
          >
            Daftar
          </button>

        </div>


        <div
          id="authMessage"
          class="auth-message"
          aria-live="polite"
          hidden
        ></div>


        ${isRegister?createRegisterForm():createLoginForm()}


        <div class="auth-security">

          <i
            class="ph ph-shield-check"
            aria-hidden="true"
          ></i>

          <span>
            Session akun diamankan menggunakan
            cookie HttpOnly dan Secure.
          </span>

        </div>

      </div>
    `,"login"),bindAuthEvents(),requestAnimationFrame(()=>{DOM.sheetContent?.querySelector(".auth-input")?.focus()})}function createLoginForm(){return`
    <form
      id="authLoginForm"
      class="auth-form"
    >

      <div class="auth-field">

        <label
          class="auth-label"
          for="authLoginEmail"
        >
          Email
        </label>

        <div class="auth-input-wrap">

          <i
            class="ph ph-envelope-simple auth-input-icon"
            aria-hidden="true"
          ></i>

          <input
            id="authLoginEmail"
            class="auth-input"
            name="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="nama@email.com"
            maxlength="255"
            required
          >

        </div>

      </div>


      <div class="auth-field">

        <label
          class="auth-label"
          for="authLoginPassword"
        >
          Kata sandi
        </label>

        <div class="auth-input-wrap">

          <i
            class="ph ph-lock-key auth-input-icon"
            aria-hidden="true"
          ></i>

          <input
            id="authLoginPassword"
            class="auth-input"
            name="password"
            type="password"
            autocomplete="current-password"
            placeholder="Masukkan kata sandi"
            maxlength="128"
            required
          >

          <button
            type="button"
            class="auth-password-toggle"
            data-auth-toggle="authLoginPassword"
            aria-label="Tampilkan kata sandi"
          >
            <i
              class="ph ph-eye"
              aria-hidden="true"
            ></i>
          </button>

        </div>

      </div>


      <button
        type="submit"
        class="auth-submit"
      >

        <i
          class="ph ph-sign-in"
          aria-hidden="true"
        ></i>

        <span>
          Masuk
        </span>

      </button>

    </form>
  `}function createRegisterForm(){return`
    <div class="auth-benefits">

      <div class="auth-benefit">
        <i class="ph ph-user-circle"></i>
        <span>Satu akun</span>
      </div>

      <div class="auth-benefit">
        <i class="ph ph-shield-check"></i>
        <span>Session aman</span>
      </div>

      <div class="auth-benefit">
        <i class="ph ph-storefront"></i>
        <span>UMKM lokal</span>
      </div>

    </div>


    <form
      id="authRegisterForm"
      class="auth-form"
    >

      <div class="auth-field">

        <label
          class="auth-label"
          for="authRegisterName"
        >
          Nama lengkap
        </label>

        <div class="auth-input-wrap">

          <i
            class="ph ph-user auth-input-icon"
            aria-hidden="true"
          ></i>

          <input
            id="authRegisterName"
            class="auth-input"
            name="name"
            type="text"
            autocomplete="name"
            placeholder="Nama lengkap"
            minlength="2"
            maxlength="100"
            required
          >

        </div>

      </div>


      <div class="auth-field">

        <label
          class="auth-label"
          for="authRegisterEmail"
        >
          Email
        </label>

        <div class="auth-input-wrap">

          <i
            class="ph ph-envelope-simple auth-input-icon"
            aria-hidden="true"
          ></i>

          <input
            id="authRegisterEmail"
            class="auth-input"
            name="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="nama@email.com"
            maxlength="255"
            required
          >

        </div>

      </div>


      <div class="auth-field">

        <label
          class="auth-label"
          for="authRegisterPassword"
        >
          Kata sandi
        </label>

        <div class="auth-input-wrap">

          <i
            class="ph ph-lock-key auth-input-icon"
            aria-hidden="true"
          ></i>

          <input
            id="authRegisterPassword"
            class="auth-input"
            name="password"
            type="password"
            autocomplete="new-password"
            placeholder="Minimal 8 karakter"
            minlength="8"
            maxlength="128"
            required
          >

          <button
            type="button"
            class="auth-password-toggle"
            data-auth-toggle="authRegisterPassword"
            aria-label="Tampilkan kata sandi"
          >
            <i
              class="ph ph-eye"
              aria-hidden="true"
            ></i>
          </button>

        </div>

        <p class="auth-field-hint">
          Gunakan minimal 8 karakter.
        </p>

      </div>


      <button
        type="submit"
        class="auth-submit"
      >

        <i
          class="ph ph-user-plus"
          aria-hidden="true"
        ></i>

        <span>
          Buat Akun
        </span>

      </button>

    </form>
  `}function bindAuthEvents(){const root=DOM.sheetContent?.querySelector("#authShell");root&&(root.querySelectorAll("[data-auth-mode]").forEach(button=>{button.addEventListener("click",()=>{renderAuthSheet(button.dataset.authMode)})}),root.querySelectorAll("[data-auth-toggle]").forEach(button=>{button.addEventListener("click",()=>{toggleAuthPassword(button)})}),root.querySelector("#authLoginForm")?.addEventListener("submit",handleLoginSubmit),root.querySelector("#authRegisterForm")?.addEventListener("submit",handleRegisterSubmit))}function toggleAuthPassword(button){const inputId=button.dataset.authToggle,input=DOM.sheetContent?.querySelector(`#${inputId}`);if(!input)return;const show=input.type==="password";input.type=show?"text":"password";const icon=button.querySelector("i");icon&&(icon.className=show?"ph ph-eye-slash":"ph ph-eye"),button.setAttribute("aria-label",show?"Sembunyikan kata sandi":"Tampilkan kata sandi"),input.focus()}async function handleLoginSubmit(event){event.preventDefault();const form=event.currentTarget;if(!form.checkValidity()){form.reportValidity();return}const formData=new FormData(form),email=String(formData.get("email")||"").trim().toLowerCase(),password=String(formData.get("password")||""),button=form.querySelector(".auth-submit");clearAuthMessage(),setAuthLoading(button,!0);try{const data=await authRequest("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});if(!data.user)throw new Error("Data akun tidak diterima.");STATE.user=data.user,renderAccount(),renderSidebar(),renderStories(),updateNavigation(),showToast(data.message||"Login berhasil."),openAccount()}catch(error){console.error("[Pasar UMKM] Login error:",error),setAuthMessage("error",error.message||"Email atau kata sandi tidak valid.")}finally{setAuthLoading(button,!1)}}async function handleRegisterSubmit(event){event.preventDefault();const form=event.currentTarget;if(!form.checkValidity()){form.reportValidity();return}const formData=new FormData(form),name=String(formData.get("name")||"").trim(),email=String(formData.get("email")||"").trim().toLowerCase(),password=String(formData.get("password")||""),button=form.querySelector(".auth-submit");clearAuthMessage(),setAuthLoading(button,!0);try{await authRequest("/api/auth/register",{method:"POST",body:JSON.stringify({name,email,password})});const loginData=await authRequest("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});if(!loginData.user)throw new Error("Akun berhasil dibuat, tetapi session belum tersedia.");STATE.user=loginData.user,renderAccount(),renderSidebar(),renderStories(),updateNavigation(),showToast("Akun berhasil dibuat."),openAccount()}catch(error){console.error("[Pasar UMKM] Register error:",error),setAuthMessage("error",error.message||"Pendaftaran belum berhasil.")}finally{setAuthLoading(button,!1)}}async function authRequest(endpoint,options={}){const response=await fetch(endpoint,{credentials:"include",cache:"no-store",...options,headers:{Accept:"application/json","Content-Type":"application/json",...options.headers}}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||data.message||`Permintaan gagal (${response.status}).`);return data}function setAuthMessage(type,message){const element=DOM.sheetContent?.querySelector("#authMessage");if(!element)return;const success=type==="success";element.className=`auth-message ${success?"success":"error"}`,element.innerHTML=`
    <i
      class="ph ${success?"ph-check-circle":"ph-warning-circle"}"
      aria-hidden="true"
    ></i>

    <span></span>
  `;const text=element.querySelector("span");text&&(text.textContent=String(message||"")),element.hidden=!1}function clearAuthMessage(){const element=DOM.sheetContent?.querySelector("#authMessage");element&&(element.hidden=!0,element.textContent="")}function setAuthLoading(button,loading){if(button){if(loading){button.disabled=!0,button.dataset.originalHtml=button.innerHTML,button.innerHTML=`
      <span
        class="auth-spinner"
        aria-hidden="true"
      ></span>

      <span>
        Memproses...
      </span>
    `;return}button.disabled=!1,button.dataset.originalHtml&&(button.innerHTML=button.dataset.originalHtml,delete button.dataset.originalHtml)}}async function openAccount(){if(!STATE.user){openLogin();return}if(closeBottomSheet(),closeSideMenu(),STATE.activeNav="account",updateNavigation(),document.querySelector(".app")?.classList.add("account-profile-active"),DOM.storiesSection&&(DOM.storiesSection.hidden=!0),DOM.homeDiscovery&&(DOM.homeDiscovery.hidden=!0),!DOM.feed)return;DOM.feed.innerHTML=`
    <section class="social-account-page">

      <section class="social-account-empty">

        <div class="social-account-empty-icon">
          <i class="ph ph-user-circle"></i>
        </div>

        <strong>
          Memuat profil
        </strong>

        <p>
          Menyiapkan halaman akun Anda.
        </p>

      </section>

    </section>
  `;let store=null;if(STATE.user.role==="seller"||STATE.user.role==="admin")try{const[currentStore,currentProducts]=await Promise.all([loadCurrentAccountStore(),loadCurrentAccountProducts()]);store=currentStore,STATE.currentStore=currentStore,STATE.accountProducts=currentProducts}catch(error){console.error("[Pasar UMKM] Account data error:",error),STATE.accountProducts=[]}else STATE.accountProducts=[];renderSocialAccountProfile(store),window.scrollTo({top:0,behavior:"auto"})}async function loadCurrentAccountStore(){const response=await fetch("/api/stores/me",{method:"GET",credentials:"include",headers:{Accept:"application/json"},cache:"no-store"});if(response.status===401)return null;const data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||"Profil UMKM belum dapat dimuat.");return data.has_store!==!0||!data.store?null:data.store}async function loadCurrentAccountProducts(){const response=await fetch("/api/products/me",{method:"GET",credentials:"include",headers:{Accept:"application/json"},cache:"no-store"});if(response.status===401)return[];const data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||"Produk toko belum dapat dimuat.");return Array.isArray(data.products)?data.products:[]}function renderSocialAccountProfile(store=null){!STATE.user||!DOM.feed||(DOM.feed.innerHTML=createSocialAccountProfileTemplate(STATE.user,store))}function createSocialAccountProfileTemplate(user,store){const isSeller=user.role==="seller"||user.role==="admin",avatarUrl=String(user.avatar_url||store?.logo_url||"").trim(),avatarTemplate=avatarUrl?`
          <img
            src="${escapeHTML(avatarUrl)}"
            alt="${escapeHTML(user.name||"Pengguna")}"
          >
        `:`
          <i
            class="ph ph-user"
            aria-hidden="true"
          ></i>
        `,bio=store?.description||(store?`Pemilik ${store.name}`:"Pengguna Pasar UMKM"),location=store?[store.district,store.city,store.province].filter(Boolean).join(", "):"",storeBadge=store?`
          <div class="social-account-seller-badge">

            <i
              class="ph ph-storefront"
              aria-hidden="true"
            ></i>

            <span>
              ${escapeHTML(store.name)}
            </span>

          </div>
        `:"",verification=store?.verification_status?`
          <div class="social-account-status">

            <i
              class="ph ${store.verification_status==="verified"?"ph-seal-check":"ph-clock"}"
              aria-hidden="true"
            ></i>

            <span>
              ${store.verification_status==="verified"?"UMKM terverifikasi":"Verifikasi UMKM sedang diproses"}
            </span>

          </div>
        `:"",sellerCenter=isSeller&&store?`
          <button
            type="button"
            class="social-account-commerce"
            data-menu-action="store"
          >

            <span
              class="social-account-commerce-icon"
            >
              <i
                class="ph ph-storefront"
                aria-hidden="true"
              ></i>
            </span>

            <span
              class="social-account-commerce-copy"
            >

              <strong>
                ${escapeHTML(store.name)}
              </strong>

              <span>
                Kelola toko dan aktivitas usaha
              </span>

            </span>

            <span
              class="social-account-commerce-arrow"
            >
              <i
                class="ph ph-caret-right"
                aria-hidden="true"
              ></i>
            </span>

          </button>
        `:"",highlights=isSeller&&store?`
          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="store"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-storefront"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Toko
            </span>
          </button>


          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="seller-products"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-package"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Produk
            </span>
          </button>


          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="orders"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-receipt"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Pesanan
            </span>
          </button>


          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="favorites"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-heart"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Favorit
            </span>
          </button>
        `:`
          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="orders"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-receipt"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Pesanan
            </span>
          </button>


          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="favorites"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-heart"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Favorit
            </span>
          </button>


          <button
            type="button"
            class="social-account-highlight"
            data-menu-action="help"
          >
            <span
              class="social-account-highlight-ring"
            >
              <span
                class="social-account-highlight-inner"
              >
                <i class="ph ph-question"></i>
              </span>
            </span>

            <span
              class="social-account-highlight-label"
            >
              Bantuan
            </span>
          </button>
        `;return`
    <section class="social-account-page">


      <!-- TOP BAR -->

      <header class="social-account-topbar">

        <div class="social-account-username">

          <strong>
            ${escapeHTML(user.name||"Pengguna")}
          </strong>

        </div>


        <div class="social-account-top-actions">

          <button
            type="button"
            class="social-account-top-button"
            data-action="account-share"
            aria-label="Bagikan profil"
          >
            <i
              class="ph ph-share-network"
              aria-hidden="true"
            ></i>
          </button>


          <button
            type="button"
            class="social-account-top-button"
            data-action="account-menu"
            aria-label="Menu akun"
          >
            <i
              class="ph ph-list"
              aria-hidden="true"
            ></i>
          </button>

        </div>

      </header>


      <!-- PROFILE HEADER -->

      <section class="social-account-header">

        <div class="social-account-main">


          <!-- AVATAR -->

          <div class="social-account-avatar-wrap">

            <div class="social-account-avatar">
              ${avatarTemplate}
            </div>

            <button
              type="button"
              class="social-account-avatar-add"
              data-action="account-edit"
              aria-label="Ubah profil"
            >
              <i class="ph ph-plus"></i>
            </button>

          </div>


          <!-- SOCIAL STATS -->

          <div class="social-account-stats">

            <div class="social-account-stat">

              <strong>
              ${getCurrentStorePostsOnly().length}
              </strong>

              <span>
                Postingan
              </span>

            </div>


            <div class="social-account-stat">

              <strong>
                0
              </strong>

              <span>
                Pengikut
              </span>

            </div>


            <div class="social-account-stat">

              <strong>
                0
              </strong>

              <span>
                Mengikuti
              </span>

            </div>

          </div>

        </div>


        <!-- BIO -->

        <div class="social-account-bio">

          <div class="social-account-name-row">

            <h1 class="social-account-name">
              ${escapeHTML(user.name||"Pengguna")}
            </h1>

          </div>


          <div class="social-account-role">
            ${escapeHTML(formatRole(user.role))}
          </div>


          ${storeBadge}

          ${verification}


          <p class="social-account-description">
            ${escapeHTML(bio)}
          </p>


          ${location?`
                  <div class="social-account-link">

                    <i
                      class="ph ph-map-pin"
                      aria-hidden="true"
                    ></i>

                    <span>
                      ${escapeHTML(location)}
                    </span>

                  </div>
                `:""}

        </div>


        <!-- PROFILE ACTIONS -->

        <div class="social-account-actions">

          <button
            type="button"
            class="social-account-action"
            data-action="account-edit"
          >
            <i
              class="ph ph-pencil-simple"
            ></i>

            <span>
              Edit profil
            </span>
          </button>


          <button
            type="button"
            class="social-account-action"
            data-action="account-share"
          >
            <i
              class="ph ph-share-network"
            ></i>

            <span>
              Bagikan profil
            </span>
          </button>

        </div>

      </section>


      <!-- SELLER CENTER -->

      ${sellerCenter}


      <!-- HIGHLIGHTS -->

      <div class="social-account-highlights">
        ${highlights}
      </div>


      <!-- TABS -->

      <nav
        class="social-account-tabs"
        aria-label="Konten profil"
      >

        <button
          type="button"
          class="social-account-tab active"
          data-action="account-tab"
          data-tab="posts"
          aria-label="Postingan"
        >
          <i class="ph ph-squares-four"></i>
        </button>


        <button
          type="button"
          class="social-account-tab"
          data-action="account-tab"
          data-tab="videos"
          aria-label="Video"
        >
          <i class="ph ph-film-strip"></i>
        </button>


        <button
          type="button"
          class="social-account-tab"
          data-action="account-tab"
          data-tab="products"
          aria-label="Produk"
        >
          <i class="ph ph-shopping-bag"></i>
        </button>


        <button
          type="button"
          class="social-account-tab"
          data-action="account-tab"
          data-tab="saved"
          aria-label="Disimpan"
        >
          <i class="ph ph-bookmark-simple"></i>
        </button>

      </nav>


      <!-- TAB CONTENT -->

      <div id="socialAccountContent">
        ${createAccountTabContent("posts")}
      </div>


    </section>
  `}function createAccountTabContent(tab){switch(tab){case"posts":{const storeId=String(STATE.currentStore?.id||""),posts=DATA.posts.filter(post=>!post.product&&String(post.store?.id||"")===storeId);return posts.length?`
    <div class="social-account-grid social-account-post-grid">

      ${posts.map(post=>`
          <button
            type="button"
            class="social-account-grid-item social-account-post-item"
            data-action="account-post-open"
            data-post-id="${escapeHTML(post.id||"")}"
            aria-label="Buka postingan ${escapeHTML(post.caption||"UMKM")}"
          >

            <img
              src="${escapeHTML(post.media?.src||ASSETS.logo)}"
              alt="${escapeHTML(post.media?.alt||post.caption||"Postingan")}"
              loading="lazy"
              decoding="async"
            >

            <span class="social-account-grid-overlay">
              <i class="ph ph-images"></i>
            </span>

          </button>
        `).join("")}

    </div>
  `:`
      <section class="social-account-empty">

        <div class="social-account-empty-icon">
          <i class="ph ph-squares-four"></i>
        </div>

        <strong>
          Belum ada postingan
        </strong>

        <p>
          Postingan pertama akun ini
          akan tampil di grid profil.
        </p>

      </section>
    `}case"videos":return`
        <section class="social-account-empty">

          <div class="social-account-empty-icon">
            <i class="ph ph-film-strip"></i>
          </div>

          <strong>
            Belum ada video
          </strong>

          <p>
            Video yang diterbitkan akun ini
            akan tampil di sini.
          </p>

        </section>
      `;case"products":{const products=Array.isArray(STATE.accountProducts)?STATE.accountProducts:[];return products.length?`
        <div class="social-account-product-grid">

          ${products.map(product=>{const image=product.image_url||product.thumbnail_url||ASSETS.logo,inactive=product.is_active===!1;return`
                <article
                  class="
                    social-product-card
                    ${inactive?"is-inactive":""}
                  "
                  data-action="product-detail"
                  data-product-id="${escapeHTML(product.id||"")}"
                >

                  <div class="social-product-media">

                    <img
                      src="${escapeHTML(image)}"
                      alt="${escapeHTML(product.name||"Produk UMKM")}"
                      loading="lazy"
                      decoding="async"
                    >

                    ${inactive?`
                            <span class="social-product-status">
                              Nonaktif
                            </span>
                          `:""}

                  </div>


                  <div class="social-product-body">

                    ${product.category_name?`
                            <span class="social-product-category">
                              ${escapeHTML(product.category_name)}
                            </span>
                          `:""}


                    <strong class="social-product-name">
                      ${escapeHTML(product.name||"Produk UMKM")}
                    </strong>


                    <div class="social-product-price">
                      ${formatRupiah(product.price)}
                    </div>


                    <div class="social-product-stock">

                      <i class="ph ph-package"></i>

                      <span>
                        Stok
                        ${escapeHTML(product.stock??0)}

                        ${product.unit?escapeHTML(product.unit):""}
                      </span>

                    </div>

                  </div>

                </article>
              `}).join("")}

        </div>
      `:`
          <section class="social-account-empty">

            <div class="social-account-empty-icon">
              <i class="ph ph-shopping-bag"></i>
            </div>

            <strong>
              Belum ada produk
            </strong>

            <p>
              Produk yang ditambahkan ke toko
              akan tampil di sini.
            </p>

          </section>
        `}case"saved":return`
        <section class="social-account-empty">

          <div class="social-account-empty-icon">
            <i class="ph ph-bookmark-simple"></i>
          </div>

          <strong>
            Belum ada yang disimpan
          </strong>

          <p>
            Postingan dan produk favorit
            akan tersedia di sini.
          </p>

        </section>
      `;default:return`
        <section class="social-account-empty">

          <div class="social-account-empty-icon">
            <i class="ph ph-squares-four"></i>
          </div>

          <strong>
            Belum ada postingan
          </strong>

          <p>
            Postingan pertama akun ini
            akan tampil di grid profil.
          </p>

        </section>
      `}}function switchAccountTab(tab,button){const page=document.querySelector(".social-account-page");if(!page)return;page.querySelectorAll(".social-account-tab").forEach(item=>{item.classList.toggle("active",item===button)});const content=page.querySelector("#socialAccountContent");content&&(content.innerHTML=createAccountTabContent(tab))}function openProductDetail(productId){const ownedProduct=Array.isArray(STATE.accountProducts)?STATE.accountProducts.find(item=>String(item.id)===String(productId)):null,publicPost=DATA.posts.find(post=>String(post.product?.id)===String(productId)),product=ownedProduct||publicPost?.product||null;if(!product){showToast("Produk tidak ditemukan.");return}const isOwner=!!ownedProduct,image=product.image_url||product.thumbnail_url||product.image||ASSETS.logo,category=product.category_name||product.category||"",stock=Number(product.stock??0);openBottomSheet(`
      <div class="auth-shell">


        <div class="product-image-preview">

          <img
            src="${escapeHTML(image)}"
            alt="${escapeHTML(product.name||"Produk UMKM")}"
          >

        </div>


        ${category?`
                <div class="product-badge">
                  ${escapeHTML(category)}
                </div>
              `:""}


        <h2
          id="sheetTitle"
          class="auth-title"
        >
          ${escapeHTML(product.name||"Produk UMKM")}
        </h2>


        <div class="product-price">
          ${formatRupiah(product.price)}
        </div>


        <div class="product-meta">

          Stok:
          ${escapeHTML(String(stock))}

          ${product.unit?escapeHTML(product.unit):""}

        </div>


        ${product.description?`
                <p class="auth-subtitle">
                  ${escapeHTML(product.description)}
                </p>
              `:""}


        ${isOwner?`
                <button
                  type="button"
                  class="btn-primary"
                  data-action="product-edit"
                  data-product-id="${escapeHTML(product.id||"")}"
                >
                  <i
                    class="ph ph-pencil-simple"
                  ></i>

                  <span>
                    Edit Produk
                  </span>
                </button>


                <button
                  type="button"
                  class="menu-sheet-btn"
                  data-action="product-delete-confirm"
                  data-product-id="${escapeHTML(product.id||"")}"
                >
                  <i
                    class="ph ph-trash"
                  ></i>

                  <span>
                    Hapus Produk
                  </span>
                </button>
              `:`
                <div class="ig-product-buttons">

                  <button
                    type="button"
                    class="ig-cart-button"
                    data-action="add-cart"
                    data-product-id="${escapeHTML(product.id||"")}"
                  >
                    <i
                      class="ph ph-shopping-cart-simple"
                    ></i>

                    <span>
                      Keranjang
                    </span>
                  </button>


                  <button
                    type="button"
                    class="ig-buy-button"
                    data-action="buy-now"
                    data-product-id="${escapeHTML(product.id||"")}"
                  >
                    <i
                      class="ph ph-shopping-bag"
                    ></i>

                    <span>
                      Beli Sekarang
                    </span>
                  </button>

                </div>
              `}


      </div>
    `,"product-detail")}function openProductEditForm(productId){const product=STATE.accountProducts.find(item=>String(item.id)===String(productId));if(!product){showToast("Produk tidak ditemukan.");return}const categoryOptions=CATEGORIES.map(category=>{const selected=String(category.id)===String(product.category_id)?"selected":"";return`
          <option
            value="${escapeHTML(category.id)}"
            ${selected}
          >
            ${escapeHTML(category.name)}
          </option>
        `}).join("");openBottomSheet(`
      <div class="auth-shell">

        <h2
          id="sheetTitle"
          class="auth-title"
        >
          Edit Produk
        </h2>


        <div class="auth-field">
          <label class="auth-label">
            Nama Produk
          </label>

          <input
            class="auth-input"
            type="text"
            value="${escapeHTML(product.name||"")}"
          >
        </div>


        <div class="auth-field">
          <label class="auth-label">
            Kategori
          </label>

          <select class="auth-input">
            <option value="">
              Pilih kategori
            </option>

            ${categoryOptions}
          </select>
        </div>


        <div class="auth-field">
          <label class="auth-label">
            Harga
          </label>

          <input
            class="auth-input"
            type="number"
            min="0"
            value="${escapeHTML(String(product.price??0))}"
          >
        </div>


        <div class="auth-field">
          <label class="auth-label">
            Stok
          </label>

          <input
            class="auth-input"
            type="number"
            min="0"
            value="${escapeHTML(String(product.stock??0))}"
          >
        </div>


        <div class="auth-field">
          <label class="auth-label">
            Satuan
          </label>

          <input
            class="auth-input"
            type="text"
            value="${escapeHTML(product.unit||"")}"
          >
        </div>


        <div class="auth-field">
          <label class="auth-label">
            Deskripsi
          </label>

          <textarea
            class="auth-input"
            rows="4"
          >${escapeHTML(product.description||"")}</textarea>
        </div>


        <button
  type="button"
  class="btn-primary"
  data-action="product-edit-save"
  data-product-id="${escapeHTML(product.id||"")}"
>
  <i class="ph ph-floppy-disk"></i>
  <span>Simpan Perubahan</span>
</button>

      </div>
    `,"product-edit")}async function handleProductEditSave(productId,element){const shell=element.closest(".auth-shell");if(!shell){showToast("Form edit produk tidak ditemukan.");return}const fields=shell.querySelectorAll(".auth-input");if(fields.length<6){showToast("Form edit produk belum lengkap.");return}const[nameInput,categoryInput,priceInput,stockInput,unitInput,descriptionInput]=fields,name=String(nameInput.value||"").trim(),categoryId=String(categoryInput.value||"").trim(),price=Number(priceInput.value),stock=Number(stockInput.value),unit=String(unitInput.value||"").trim(),description=String(descriptionInput.value||"").trim();if(name.length<2){showToast("Nama produk minimal 2 karakter."),nameInput.focus();return}if(!Number.isFinite(price)||price<0){showToast("Harga produk tidak valid."),priceInput.focus();return}if(!Number.isInteger(stock)||stock<0){showToast("Stok produk tidak valid."),stockInput.focus();return}const label=element.querySelector("span"),oldLabel=label?.textContent||"Simpan Perubahan";element.disabled=!0,label&&(label.textContent="Menyimpan...");try{const response=await fetch(`/api/products/${encodeURIComponent(productId)}`,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({name,category_id:categoryId||null,price,stock,unit,description})}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||"Produk gagal diperbarui.");showToast("Produk berhasil diperbarui."),await openAccount();const productsTab=document.querySelector('.social-account-tab[data-tab="products"]');productsTab&&switchAccountTab("products",productsTab)}catch(error){console.error("[Pasar UMKM] Product update error:",error),showToast(error.message||"Produk gagal diperbarui.")}finally{element.disabled=!1,label&&(label.textContent=oldLabel)}}function openProductDeleteConfirm(productId){const product=STATE.accountProducts.find(item=>String(item.id)===String(productId));if(!product){showToast("Produk tidak ditemukan.");return}openBottomSheet(`
      <div class="auth-shell">

        <div
          class="auth-title"
          id="sheetTitle"
        >
          Hapus Produk?
        </div>


        <p class="auth-subtitle">
          Produk
          <strong>
            ${escapeHTML(product.name||"Produk UMKM")}
          </strong>
          akan dinonaktifkan dari Pasar UMKM.
        </p>


        <p class="auth-subtitle">
          Produk tidak akan langsung dihapus
          permanen dari database.
        </p>


        <button
          type="button"
          class="btn-primary"
          data-action="product-delete"
          data-product-id="${escapeHTML(product.id||"")}"
        >
          <i class="ph ph-trash"></i>
          <span>Ya, Hapus Produk</span>
        </button>


        <button
          type="button"
          class="menu-sheet-btn"
          data-action="close-sheet"
        >
          <i class="ph ph-x"></i>
          <span>Batal</span>
        </button>

      </div>
    `,"product-delete-confirm")}async function handleProductDelete(productId,element){if(!productId){showToast("Produk tidak ditemukan.");return}const label=element.querySelector("span"),oldLabel=label?.textContent||"Ya, Hapus Produk";element.disabled=!0,label&&(label.textContent="Menghapus...");try{const response=await fetch(`/api/products/${encodeURIComponent(productId)}`,{method:"DELETE",credentials:"include",headers:{Accept:"application/json"}}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||"Produk gagal dihapus.");showToast("Produk berhasil dihapus."),await openAccount();const productsTab=document.querySelector('.social-account-tab[data-tab="products"]');productsTab&&switchAccountTab("products",productsTab)}catch(error){console.error("[Pasar UMKM] Product delete error:",error),showToast(error.message||"Produk gagal dihapus.")}finally{element.disabled=!1,label&&(label.textContent=oldLabel)}}function openAccountMenu(){openBottomSheet(`
      <h2 id="sheetTitle">
        Akun
      </h2>


      <button
        type="button"
        class="menu-sheet-btn"
        data-action="account-edit"
      >
        <i class="ph ph-user-circle"></i>
        Edit Profil
      </button>


      ${STATE.user?.role==="seller"||STATE.user?.role==="admin"?`
              <button
                type="button"
                class="menu-sheet-btn"
                data-menu-action="store"
              >
                <i class="ph ph-storefront"></i>
                Kelola Toko
              </button>
            `:""}


      <button
        type="button"
        class="menu-sheet-btn"
        data-action="account-logout"
      >
        <i class="ph ph-sign-out"></i>
        Keluar
      </button>
    `,"account-menu")}function openAccountEditInfo(){openBottomSheet(createInformationState("Edit Profil","user-circle","Foto profil, bio, username, dan informasi akun akan dikelola melalui fitur Edit Profil."),"account-edit")}async function shareSellerProfile(storeId){const store=getStores().find(item=>String(item.id)===String(storeId));if(!store){showToast("UMKM tidak ditemukan.");return}const url=`${window.location.origin}${window.location.pathname}`,text=`Lihat ${store.name||"UMKM Lokal"} di Pasar UMKM Lubuklinggau.`;try{if(navigator.share){await navigator.share({title:store.name||CONFIG.APP_NAME,text,url});return}await navigator.clipboard.writeText(`${text} ${url}`),showToast("Tautan UMKM berhasil disalin.")}catch(error){error.name!=="AbortError"&&console.error("[Pasar UMKM] Seller share error:",error)}}async function shareAccountProfile(){const url=`${window.location.origin}${window.location.pathname}#account`;try{if(navigator.share){await navigator.share({title:STATE.user?.name||CONFIG.APP_NAME,text:"Lihat profil saya di Pasar UMKM.",url});return}await navigator.clipboard.writeText(url),showToast("Tautan profil berhasil disalin.")}catch(error){error.name!=="AbortError"&&console.error("[Pasar UMKM] Account share error:",error)}}function logoutFromAccount(){leaveAccountProfile(),STATE.activeNav="home",updateNavigation(),logout()}function leaveAccountProfile(){const app=document.querySelector(".app");app?.classList.contains("account-profile-active")&&(app.classList.remove("account-profile-active"),DOM.homeDiscovery&&(DOM.homeDiscovery.hidden=!1),renderStories(),DOM.feed&&renderFeed())}async function logout(){const logoutButtons=document.querySelectorAll('[data-action="logout"]');logoutButtons.forEach(button=>{button.disabled=!0});try{const response=await fetch("/api/auth/logout",{method:"POST",credentials:"include",headers:{Accept:"application/json"},cache:"no-store"}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||`Logout gagal: ${response.status}`);STATE.user=null,renderAccount(),renderSidebar(),renderStories(),closeBottomSheet(),closeSideMenu(),showToast(data.message||"Anda telah keluar.")}catch(error){console.error("[Pasar UMKM] Logout error:",error),logoutButtons.forEach(button=>{button.disabled=!1}),showToast("Gagal keluar. Silakan coba lagi.")}}function formatRole(role){return role==="seller"?"Pemilik UMKM":role==="admin"?"Pengelola":"Pembeli"}function openPostCreateInfo(){if(!STATE.user||STATE.user.role!=="seller"&&STATE.user.role!=="admin"){showToast("Hanya pemilik UMKM yang dapat membuat postingan.");return}openBottomSheet(`
      <div
        class="auth-shell"
        id="postCreateShell"
      >

        <section class="auth-brand">

          <div class="auth-brand-mark">
            <i
              class="ph ph-camera"
              aria-hidden="true"
              style="font-size:32px;"
            ></i>
          </div>


          <div
            id="sheetTitle"
            class="auth-title"
            role="heading"
            aria-level="2"
          >
            Buat Postingan
          </div>


          <p class="auth-subtitle">
            Bagikan cerita, promosi,
            atau aktivitas UMKM Anda.
          </p>

        </section>


        <form
          id="postCreateForm"
          class="auth-form"
        >

          <div class="auth-field">

            <label
              class="auth-label"
              for="postCreateImage"
            >
              Foto
            </label>


            <label
              for="postCreateImage"
              class="product-image-picker"
            >

              <div
                class="product-image-preview"
                id="postImagePreview"
              >

                <i
                  class="ph ph-camera-plus"
                  aria-hidden="true"
                ></i>

                <span>
                  Pilih Foto Postingan
                </span>

              </div>

            </label>


            <input
              id="postCreateImage"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
            >


            <small class="product-image-help">
              JPG, PNG, atau WEBP.
              Maksimal 5 MB.
            </small>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="postCreateCaption"
            >
              Caption
            </label>


            <textarea
              id="postCreateCaption"
              class="auth-input"
              name="caption"
              rows="5"
              maxlength="1000"
              placeholder="Ceritakan sesuatu tentang UMKM Anda..."
              required
              style="
                min-height:130px;
                resize:vertical;
                padding-top:14px;
              "
            ></textarea>

          </div>


          <button
            type="submit"
            class="btn-primary auth-submit"
          >

            <i
              class="ph ph-paper-plane-tilt"
              aria-hidden="true"
            ></i>

            <span>
              Bagikan Postingan
            </span>

          </button>

        </form>


        <div class="auth-security">

          <i
            class="ph ph-storefront"
            aria-hidden="true"
          ></i>

          <span>
            Postingan akan tampil sebagai
            konten dari UMKM Anda.
          </span>

        </div>

      </div>
    `,"post-create");const form=DOM.sheetContent?.querySelector("#postCreateForm"),imageInput=DOM.sheetContent?.querySelector("#postCreateImage"),imagePreview=DOM.sheetContent?.querySelector("#postImagePreview");imageInput&&imagePreview&&imageInput.addEventListener("change",()=>{const file=imageInput.files?.[0];if(!file)return;if(file.size>5*1024*1024){showToast("Ukuran foto maksimal 5 MB."),imageInput.value="";return}const imageURL=URL.createObjectURL(file);imagePreview.innerHTML=`
          <img
            src="${imageURL}"
            alt="Preview postingan"
            style="
              width:100%;
              height:100%;
              object-fit:cover;
              display:block;
            "
          >
        `}),form&&form.addEventListener("submit",async event=>{event.preventDefault();const caption=String(form.caption?.value||"").trim();if(!caption){showToast("Caption postingan belum diisi.");return}const imageFile=form.querySelector("#postCreateImage")?.files?.[0];if(!imageFile){showToast("Pilih foto postingan terlebih dahulu.");return}const submitButton=form.querySelector('[type="submit"]'),buttonText=submitButton?.querySelector("span");submitButton&&(submitButton.disabled=!0),buttonText&&(buttonText.textContent="Mengunggah foto...");try{const uploadData=new FormData;uploadData.append("file",imageFile);const response=await fetch("/api/uploads/post-image",{method:"POST",credentials:"include",body:uploadData}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0||!data.image?.url)throw new Error(data.error||"Foto postingan gagal diunggah.");form.dataset.uploadedImageUrl=data.image.url;const postPayload={caption,image_url:data.image.url};console.log("[Pasar UMKM] Post payload ready:",postPayload);const postResponse=await fetch("/api/posts",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(postPayload)}),postData=await postResponse.json().catch(()=>({}));if(!postResponse.ok||postData.ok!==!0)throw new Error(postData.error||"Postingan gagal dipublikasikan.");console.log("[Pasar UMKM] Post published:",postData),showToast("Postingan berhasil dipublikasikan."),await loadInitialData(),renderApplication(),closeBottomSheet(),submitButton&&(submitButton.disabled=!1),buttonText&&(buttonText.textContent="Bagikan Postingan")}catch(error){console.error("[Pasar UMKM] Post image upload error:",error),showToast(error.message||"Foto postingan gagal diunggah."),submitButton&&(submitButton.disabled=!1),buttonText&&(buttonText.textContent="Bagikan Postingan")}}),requestAnimationFrame(()=>{DOM.sheetContent?.querySelector("#postCreateCaption")?.focus()})}function openSell(){if(!STATE.user){showToast("Masuk untuk mulai menjual."),openLogin();return}if(STATE.user.role!=="seller"&&STATE.user.role!=="admin"){renderStoreRegistrationForm();return}openBottomSheet(`
      <h2 id="sheetTitle">
        Pusat Penjual
      </h2>


      <section class="side-account">

        <div class="side-account-user-main">

          <div class="side-account-avatar">

            <i
              class="ph ph-storefront"
              aria-hidden="true"
            ></i>

          </div>


          <div class="side-account-user-info">

            <strong class="side-account-user-name">
              Pusat Penjual
            </strong>

            <span class="side-account-user-role">
              Kelola UMKM dan produk Anda
            </span>

          </div>

        </div>

      </section>


      <button
        type="button"
        class="menu-sheet-btn"
        data-action="product-create"
      >

        <i class="ph ph-plus-circle"></i>

        Tambah Produk

      </button>


      <button
        type="button"
        class="menu-sheet-btn"
        data-action="post-create"
      >

        <i class="ph ph-camera"></i>

        Buat Postingan

      </button>


      <button
        type="button"
        class="menu-sheet-btn"
        data-menu-action="store"
      >

        <i class="ph ph-storefront"></i>

        Kelola Toko

      </button>
    `,"sell")}function openProductCreateForm(){if(!STATE.user||STATE.user.role!=="seller"&&STATE.user.role!=="admin"){showToast("Hanya pemilik UMKM yang dapat menambahkan produk.");return}const categoryOptions=Array.isArray(CATEGORIES)?CATEGORIES.map(category=>`
            <option
              value="${escapeHTML(category.id)}"
            >
              ${escapeHTML(category.name)}
            </option>
          `).join(""):"";openBottomSheet(`
      <div
        class="auth-shell"
        id="productCreateShell"
      >

        <section class="auth-brand">

          <div class="auth-brand-mark">
            <i
              class="ph ph-package"
              aria-hidden="true"
              style="font-size:32px;"
            ></i>
          </div>

          <div
            id="sheetTitle"
            class="auth-title"
            role="heading"
            aria-level="2"
          >
            Tambah Produk
          </div>

          <p class="auth-subtitle">
            Tambahkan produk baru ke toko Anda.
          </p>

        </section>


        <div
          id="productCreateMessage"
          class="auth-message"
          aria-live="polite"
          hidden
        ></div>


        <form
          id="productCreateForm"
          class="auth-form"
        >
        <div class="auth-field">

  <label
    class="auth-label"
    for="productCreateImage"
  >
    Foto Produk
  </label>

  <label
    for="productCreateImage"
    class="product-image-picker"
  >

    <div
      class="product-image-preview"
      id="productImagePreview"
    >
      <i class="ph ph-camera-plus"></i>

      <span>
        Pilih Foto Produk
      </span>
    </div>

  </label>

  <input
    id="productCreateImage"
    name="image"
    type="file"
    accept="image/jpeg,image/png,image/webp"
    hidden
  >

  <small class="product-image-help">
    JPG, PNG, atau WEBP. Maksimal 5 MB.
  </small>

</div>

          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreateName"
            >
              Nama Produk
            </label>

            <div class="auth-input-wrap">

              <i
                class="ph ph-package auth-input-icon"
                aria-hidden="true"
              ></i>

              <input
                id="productCreateName"
                class="auth-input"
                name="name"
                type="text"
                minlength="2"
                maxlength="150"
                placeholder="Contoh: Keripik Pisang Cokelat"
                required
              >

            </div>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreateCategory"
            >
              Kategori
            </label>

            <select
              id="productCreateCategory"
              class="auth-input"
              name="category_id"
            >
              <option value="">
                Pilih kategori
              </option>

              ${categoryOptions}

            </select>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreatePrice"
            >
              Harga
            </label>

            <div class="auth-input-wrap">

              <i
                class="ph ph-currency-circle-dollar auth-input-icon"
                aria-hidden="true"
              ></i>

              <input
                id="productCreatePrice"
                class="auth-input"
                name="price"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                placeholder="15000"
                required
              >

            </div>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreateStock"
            >
              Stok
            </label>

            <div class="auth-input-wrap">

              <i
                class="ph ph-stack auth-input-icon"
                aria-hidden="true"
              ></i>

              <input
                id="productCreateStock"
                class="auth-input"
                name="stock"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                value="0"
                required
              >

            </div>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreateUnit"
            >
              Satuan
            </label>

            <div class="auth-input-wrap">

              <i
                class="ph ph-tag auth-input-icon"
                aria-hidden="true"
              ></i>

              <input
                id="productCreateUnit"
                class="auth-input"
                name="unit"
                type="text"
                maxlength="50"
                placeholder="pcs, kotak, botol, porsi..."
              >

            </div>

          </div>


          <div class="auth-field">

            <label
              class="auth-label"
              for="productCreateDescription"
            >
              Deskripsi
            </label>

            <textarea
              id="productCreateDescription"
              class="auth-input"
              name="description"
              rows="4"
              placeholder="Jelaskan produk Anda..."
              style="
                min-height:110px;
                resize:vertical;
                padding-top:14px;
              "
            ></textarea>

          </div>


          <button
            type="submit"
            class="btn-primary auth-submit"
          >
            <i
              class="ph ph-plus-circle"
              aria-hidden="true"
            ></i>

            <span>
              Tambahkan Produk
            </span>
          </button>

        </form>


        <div class="auth-security">

          <i
            class="ph ph-shield-check"
            aria-hidden="true"
          ></i>

          <span>
            Produk akan terhubung langsung
            dengan UMKM Anda.
          </span>

        </div>

      </div>
    `,"product-create"),bindProductCreateEvents(),requestAnimationFrame(()=>{DOM.sheetContent?.querySelector("#productCreateName")?.focus()})}function bindProductCreateEvents(){const form=DOM.sheetContent?.querySelector("#productCreateForm");if(!form)return;form.addEventListener("submit",handleProductCreateSubmit),form.querySelector("#productCreateImage")?.addEventListener("change",event=>{const file=event.target.files?.[0],preview=form.querySelector("#productImagePreview");if(!file||!preview)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)){showToast("Foto harus JPG, PNG, atau WEBP."),event.target.value="";return}if(file.size>5*1024*1024){showToast("Ukuran foto maksimal 5 MB."),event.target.value="";return}const reader=new FileReader;reader.onload=()=>{preview.innerHTML=`
          <img
            src="${reader.result}"
            alt="Preview foto produk"
          >
        `},reader.readAsDataURL(file)})}async function handleProductCreateSubmit(event){event.preventDefault();const form=event.currentTarget,submitButton=form.querySelector('[type="submit"]'),message=DOM.sheetContent?.querySelector("#productCreateMessage"),formData=new FormData(form),imageFile=formData.get("image"),payload={name:String(formData.get("name")||"").trim(),category_id:String(formData.get("category_id")||"").trim()||null,price:Number(formData.get("price")),stock:Number(formData.get("stock")),unit:String(formData.get("unit")||"").trim(),description:String(formData.get("description")||"").trim(),thumbnail_url:null};if(payload.name.length<2){showToast("Nama produk minimal 2 karakter.");return}if(!Number.isFinite(payload.price)||payload.price<0){showToast("Harga produk tidak valid.");return}if(!Number.isInteger(payload.stock)||payload.stock<0){showToast("Stok produk tidak valid.");return}if(submitButton){submitButton.disabled=!0;const buttonText=submitButton.querySelector("span");buttonText&&(buttonText.textContent="Mengunggah foto...")}message&&(message.hidden=!0,message.textContent="");try{if(imageFile instanceof File&&imageFile.size>0){const uploadFormData=new FormData;uploadFormData.append("file",imageFile);const uploadResponse=await fetch("/api/uploads/product-image",{method:"POST",credentials:"include",body:uploadFormData}),uploadData=await uploadResponse.json().catch(()=>({}));if(!uploadResponse.ok||uploadData.ok!==!0||!uploadData.image?.url)throw new Error(uploadData.error||"Foto produk gagal diunggah.");payload.thumbnail_url=uploadData.image.url;const buttonText=submitButton?.querySelector("span");buttonText&&(buttonText.textContent="Menyimpan produk...")}const response=await fetch("/api/products",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload)}),data=await response.json().catch(()=>({}));if(!response.ok||data.ok!==!0)throw new Error(data.error||"Produk gagal ditambahkan.");showToast(data.message||"Produk berhasil ditambahkan."),closeBottomSheet(),await openAccount();const productTab=document.querySelector('.social-account-tab[data-tab="products"]');productTab&&switchAccountTab("products",productTab)}catch(error){if(console.error("[Pasar UMKM] Product create error:",error),message&&(message.textContent=error.message||"Produk gagal ditambahkan.",message.hidden=!1),submitButton){submitButton.disabled=!1;const buttonText=submitButton.querySelector("span");buttonText&&(buttonText.textContent="Tambahkan Produk")}}}function renderStoreRegistrationForm(){openBottomSheet(`
      <div
        class="auth-shell"
        id="storeRegisterShell"
      >

        <section class="auth-brand">

          <div class="auth-brand-mark">

            <i
              class="ph ph-storefront"
              aria-hidden="true"
              style="font-size:32px;"
            ></i>

          </div>


          <div
            id="sheetTitle"
            class="auth-title"
            role="heading"
            aria-level="2"
          >
            Daftarkan UMKM
          </div>


          <p class="auth-subtitle">
            Buat profil UMKM Anda untuk mulai
            menjual produk di Pasar UMKM.
          </p>

        </section>


        <div
          id="authMessage"
          class="auth-message"
          aria-live="polite"
          hidden
        ></div>


        <form
          id="storeRegisterForm"
          class="auth-form"
        >

          <div class="auth-field">

            <label
              class="auth-label"
              for="storeRegisterName"
            >
              Nama UMKM
            </label>


            <div class="auth-input-wrap">

              <i
                class="ph ph-storefront auth-input-icon"
                aria-hidden="true"
              ></i>


              <input
                id="storeRegisterName"
                class="auth-input"
                type="text"
                name="name"
                minlength="3"
                maxlength="100"
                autocomplete="organization"
                placeholder="Contoh: Kopi Linggau"
                required
              >

            </div>

          </div>


          <p
            class="empty-state-text"
            style="
              text-align:left;
              margin:0;
              font-size:13px;
              line-height:1.55;
            "
          >
            Nama UMKM dapat diubah melalui
            pengaturan toko setelah pendaftaran.
          </p>


          <button
            type="submit"
            class="btn-primary auth-submit"
          >
            <i
              class="ph ph-storefront"
              aria-hidden="true"
            ></i>

            <span>
              Daftarkan UMKM
            </span>
          </button>

        </form>


        <div class="auth-security">

          <i
            class="ph ph-shield-check"
            aria-hidden="true"
          ></i>

          <span>
            UMKM akan terhubung langsung
            dengan akun Anda.
          </span>

        </div>

      </div>
    `,"seller-register"),bindStoreRegisterEvents(),requestAnimationFrame(()=>{DOM.sheetContent?.querySelector("#storeRegisterName")?.focus()})}function bindStoreRegisterEvents(){const form=DOM.sheetContent?.querySelector("#storeRegisterForm");form&&form.addEventListener("submit",handleStoreRegisterSubmit)}async function handleStoreRegisterSubmit(event){event.preventDefault();const form=event.currentTarget;if(!form.checkValidity()){form.reportValidity();return}const formData=new FormData(form),name=String(formData.get("name")||"").trim().replace(/\s+/g," "),button=form.querySelector(".auth-submit");clearAuthMessage(),setAuthLoading(button,!0);try{const data=await authRequest("/api/stores",{method:"POST",body:JSON.stringify({name})});if(!data.store)throw new Error("Data UMKM tidak diterima dari server.");data.user?STATE.user=data.user:await restoreAuthSession(),await loadStores(),renderAccount(),renderSidebar(),renderStories(),updateNavigation(),showToast(data.message||"UMKM berhasil didaftarkan."),openSell()}catch(error){console.error("[Pasar UMKM] Store registration error:",error),setAuthMessage("error",error.message||"UMKM belum berhasil didaftarkan."),setAuthLoading(button,!1)}}function openStores(){const stores=getStores();if(!stores.length){openBottomSheet(`
        <h2 id="sheetTitle">
          Jelajahi UMKM
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-storefront"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada UMKM
          </strong>

          <p class="empty-state-text">
            UMKM yang telah terdaftar
            akan tampil di sini.
          </p>

        </section>
      `,"stores");return}const html=stores.map(store=>{const location=[store.district,store.city].filter(Boolean).join(", ")||"Lubuklinggau",isVerified=store.verificationStatus==="verified";return`
          <button
            type="button"
            class="store-directory-card"
            data-action="store-detail"
            data-store-id="${escapeHTML(store.id)}"
          >

            <div class="store-directory-logo">

              ${store.logo?`
                      <img
                        src="${escapeHTML(store.logo)}"
                        alt="${escapeHTML(store.name)}"
                      >
                    `:`
                      <i
                        class="ph ph-storefront"
                        aria-hidden="true"
                      ></i>
                    `}

            </div>


            <div class="store-directory-info">

              <div class="store-directory-name">

                <span>
                  ${escapeHTML(store.name)}
                </span>

                ${isVerified?`
                        <i
                          class="ph-fill ph-seal-check"
                          aria-label="UMKM terverifikasi"
                        ></i>
                      `:""}

              </div>


              ${store.category?`
                      <div class="store-directory-category">
                        ${escapeHTML(store.category)}
                      </div>
                    `:""}


              <div class="store-directory-location">

                <i
                  class="ph ph-map-pin"
                  aria-hidden="true"
                ></i>

                <span>
                  ${escapeHTML(location)}
                </span>

              </div>


              <div class="store-directory-bottom">

                <span>
                  ${Number(store.productCount||0)}
                  Produk
                </span>

                <span class="store-directory-open">
                  Lihat Toko

                  <i
                    class="ph ph-arrow-right"
                    aria-hidden="true"
                  ></i>
                </span>

              </div>

            </div>

          </button>
        `}).join("");openBottomSheet(`
      <h2 id="sheetTitle">
        Jelajahi UMKM
      </h2>

      <div class="store-directory-list">
        ${html}
      </div>
    `,"stores")}function openStoreDetail(storeId){const store=getStores().find(item=>String(item.id)===String(storeId));if(!store){showToast("UMKM tidak ditemukan.");return}const location=[store.address,store.district,store.city,store.province].filter(Boolean).join(", ")||"Lubuklinggau",isVerified=store.verificationStatus==="verified",storeProducts=DATA.posts.filter(post=>String(post.store?.id)===String(store.id)&&post.product?.id).map(post=>post.product),productHTML=storeProducts.length?`
          <section class="store-catalog-section">

            <div class="store-catalog-heading">

              <div>
                <span class="store-catalog-eyebrow">
                  KATALOG TOKO
                </span>

                <h3>
                  Produk
                </h3>
              </div>

              <span class="store-catalog-count">
                ${storeProducts.length}
                produk
              </span>

            </div>


            <div class="store-catalog-grid">

              ${storeProducts.map(product=>{const image=product.image||product.image_url||product.thumbnail_url||ASSETS.logo;return`
                    <button
                      type="button"
                      class="store-catalog-card"
                      data-action="product-detail"
                      data-product-id="${escapeHTML(product.id||"")}"
                    >

                      <div class="store-catalog-media">

                        <img
                          src="${escapeHTML(image)}"
                          alt="${escapeHTML(product.name||"Produk UMKM")}"
                          loading="lazy"
                          decoding="async"
                        >

                      </div>


                      <div class="store-catalog-body">

                        ${product.category?`
                                <span class="store-catalog-category">
                                  ${escapeHTML(product.category)}
                                </span>
                              `:""}


                        <strong class="store-catalog-name">
                          ${escapeHTML(product.name||"Produk UMKM")}
                        </strong>


                        <div class="store-catalog-price">
                          ${formatRupiah(product.price)}
                        </div>


                        <div class="store-catalog-stock">

                          <i
                            class="ph ph-package"
                            aria-hidden="true"
                          ></i>

                          <span>
                            Stok
                            ${escapeHTML(String(product.stock??0))}

                            ${product.unit?escapeHTML(product.unit):""}
                          </span>

                        </div>

                      </div>

                    </button>
                  `}).join("")}

            </div>

          </section>
        `:`
          <section class="store-catalog-empty">

            <i
              class="ph ph-shopping-bag"
              aria-hidden="true"
            ></i>

            <strong>
              Belum ada produk
            </strong>

            <p>
              Produk dari UMKM ini
              akan tampil di sini.
            </p>

          </section>
        `;openBottomSheet(`
      <div class="store-detail-shell">

  <button
    type="button"
    class="store-detail-back"
    data-menu-action="stores"
    aria-label="Kembali ke daftar UMKM"
  >
    <i
      class="ph ph-arrow-left"
      aria-hidden="true"
    ></i>

    <span>
      Jelajahi UMKM
    </span>
  </button>


  <div class="store-detail-cover">
          ${store.cover?`
                  <img
                    src="${escapeHTML(store.cover)}"
                    alt=""
                  >
                `:`
                  <div class="store-detail-cover-placeholder">
                  </div>
                `}

        </div>


        <div class="store-detail-profile">


          <div class="store-detail-logo">

            ${store.logo?`
                    <img
                      src="${escapeHTML(store.logo)}"
                      alt="${escapeHTML(store.name)}"
                    >
                  `:`
                    <i
                      class="ph ph-storefront"
                      aria-hidden="true"
                    ></i>
                  `}

          </div>


          <div class="store-detail-heading">

            <div
              id="sheetTitle"
              class="store-detail-name"
            >

              ${escapeHTML(store.name)}

              ${isVerified?`
                      <i
                        class="ph-fill ph-seal-check"
                        aria-label="UMKM terverifikasi"
                      ></i>
                    `:""}

            </div>


            ${store.category?`
                    <div class="store-detail-category">
                      ${escapeHTML(store.category)}
                    </div>
                  `:""}

          </div>

        </div>


        <div class="store-detail-stats">

          <div>

            <strong>
              ${Number(store.productCount||0)}
            </strong>

            <span>
              Produk
            </span>

          </div>


          <div>

            <strong>
              ${isVerified?"Ya":"Belum"}
            </strong>

            <span>
              Terverifikasi
            </span>

          </div>

        </div>


        ${store.description?`
                <p class="store-detail-description">
                  ${escapeHTML(store.description)}
                </p>
              `:""}


       <div class="store-detail-location">

  <i
    class="ph ph-map-pin"
    aria-hidden="true"
  ></i>

  <span>
    ${escapeHTML(location)}
  </span>

</div>


<button
  type="button"
  class="store-detail-profile-button"
  data-action="seller-profile"
  data-store-id="${escapeHTML(store.id||"")}"
>
  <span class="store-detail-profile-icon">
    <i
      class="ph ph-user-circle"
      aria-hidden="true"
    ></i>
  </span>

  <span class="store-detail-profile-copy">

    <strong>
      Lihat Profil UMKM
    </strong>

    <small>
      Postingan, produk, dan informasi penjual
    </small>

  </span>

  <i
    class="ph ph-caret-right store-detail-profile-arrow"
    aria-hidden="true"
  ></i>
</button>


${productHTML}


      </div>
    `,"store-detail")}function handleSellerFollow(storeId){if(!getStores().find(item=>String(item.id)===String(storeId))){showToast("UMKM tidak ditemukan.");return}if(!STATE.user){showToast("Masuk terlebih dahulu untuk mengikuti UMKM."),openLogin();return}showToast("Fitur mengikuti UMKM segera tersedia.")}function openSellerProfile(storeId){const store=getStores().find(item=>String(item.id)===String(storeId));if(!store){showToast("Profil UMKM tidak ditemukan.");return}if(closeBottomSheet(),closeSideMenu(),STATE.activeNav="home",updateNavigation(),document.querySelector(".app")?.classList.add("account-profile-active"),DOM.storiesSection&&(DOM.storiesSection.hidden=!0),DOM.homeDiscovery&&(DOM.homeDiscovery.hidden=!0),!DOM.feed)return;const sellerFeedItems=DATA.posts.filter(post=>String(post.store?.id)===String(store.id)),sellerPosts=sellerFeedItems.filter(post=>!post.product),sellerProducts=sellerFeedItems.filter(post=>post.product?.id).map(post=>post.product),avatar=store.logo||sellerFeedItems[0]?.store?.avatar||ASSETS.logo,location=[store.district,store.city].filter(Boolean).join(", ")||store.province||CONFIG.CITY,isVerified=store.verificationStatus==="verified",productGrid=sellerProducts.length?`
          <div class="social-account-product-grid">

            ${sellerProducts.map(product=>{const image=product.image||product.image_url||product.thumbnail_url||ASSETS.logo;return`
                  <article
                    class="social-product-card"
                    data-action="product-detail"
                    data-product-id="${escapeHTML(product.id||"")}"
                  >

                    <div class="social-product-media">

                      <img
                        src="${escapeHTML(image)}"
                        alt="${escapeHTML(product.name||"Produk UMKM")}"
                        loading="lazy"
                        decoding="async"
                      >

                    </div>


                    <div class="social-product-body">

                      ${product.category?`
                              <span class="social-product-category">
                                ${escapeHTML(product.category)}
                              </span>
                            `:""}


                      <strong class="social-product-name">
                        ${escapeHTML(product.name||"Produk UMKM")}
                      </strong>


                      <div class="social-product-price">
                        ${formatRupiah(product.price)}
                      </div>


                      <div class="social-product-stock">

                        <i
                          class="ph ph-package"
                          aria-hidden="true"
                        ></i>

                        <span>
                          Stok
                          ${escapeHTML(String(product.stock??0))}

                          ${product.unit?escapeHTML(product.unit):""}
                        </span>

                      </div>

                    </div>

                  </article>
                `}).join("")}

          </div>
        `:`
          <section class="social-account-empty">

            <div class="social-account-empty-icon">
              <i class="ph ph-shopping-bag"></i>
            </div>

            <strong>
              Belum ada produk
            </strong>

            <p>
              Produk dari UMKM ini
              akan tampil di sini.
            </p>

          </section>
        `;DOM.feed.innerHTML=`
    <section
      class="
        social-account-page
        public-seller-profile
      "
      data-store-id="${escapeHTML(store.id)}"
    >


      <!-- =====================================
           TOP BAR
           ===================================== -->

      <header class="social-account-topbar">

        <button
          type="button"
          class="social-account-top-button"
          data-action="seller-profile-back"
          aria-label="Kembali"
        >
          <i
            class="ph ph-arrow-left"
            aria-hidden="true"
          ></i>
        </button>


        <div class="social-account-username">

          <strong>
            ${escapeHTML(store.name)}
          </strong>

          ${isVerified?`
                  <i
                    class="ph-fill ph-seal-check verified-badge"
                    aria-label="UMKM terverifikasi"
                  ></i>
                `:""}

        </div>


        <button
          type="button"
          class="social-account-top-button"
          data-action="seller-share"
          data-store-id="${escapeHTML(store.id)}"
          aria-label="Bagikan profil"
        >
          <i
            class="ph ph-share-network"
            aria-hidden="true"
          ></i>
        </button>

      </header>


      <!-- =====================================
           PROFILE
           ===================================== -->

      <section class="social-account-header">


        <div class="social-account-main">


          <div class="social-account-avatar-wrap">

            <div class="social-account-avatar">

              <img
                src="${escapeHTML(avatar)}"
                alt="${escapeHTML(store.name)}"
                loading="lazy"
                decoding="async"
              >

            </div>

          </div>


          <div class="social-account-stats">


            <div class="social-account-stat">

              <strong>
                ${sellerPosts.length}
              </strong>

              <span>
                Postingan
              </span>

            </div>


            <div class="social-account-stat">

              <strong>
                0
              </strong>

              <span>
                Pengikut
              </span>

            </div>


            <div class="social-account-stat">

              <strong>
                0
              </strong>

              <span>
                Mengikuti
              </span>

            </div>


          </div>

        </div>


        <!-- =================================
             BIO
             ================================= -->

        <div class="social-account-bio">


          <div class="social-account-name-row">

            <h1 class="social-account-name">
              ${escapeHTML(store.name)}
            </h1>


            ${isVerified?`
                    <i
                      class="ph-fill ph-seal-check verified-badge"
                      aria-label="UMKM terverifikasi"
                    ></i>
                  `:""}

          </div>


          <div class="social-account-role">

            ${store.category?escapeHTML(store.category):"UMKM Lokal"}

          </div>


          ${store.description?`
                  <p class="social-account-description">
                    ${escapeHTML(store.description)}
                  </p>
                `:""}


          <div class="social-account-link">

            <i
              class="ph ph-map-pin"
              aria-hidden="true"
            ></i>

            <span>
              ${escapeHTML(location)}
            </span>

          </div>

        </div>


        <!-- =================================
             PUBLIC ACTIONS
             ================================= -->

        <div class="public-seller-actions">


          <button
            type="button"
            class="
              public-seller-action
              public-seller-follow
            "
            data-action="seller-follow"
            data-store-id="${escapeHTML(store.id)}"
          >

            <span>
              Ikuti
            </span>

            <i
              class="ph ph-caret-down"
              aria-hidden="true"
            ></i>

          </button>


          <button
            type="button"
            class="public-seller-action"
            data-action="seller-message"
            data-store-id="${escapeHTML(store.id)}"
          >

            <i
              class="ph ph-chat-circle"
              aria-hidden="true"
            ></i>

            <span>
              Kirim Pesan
            </span>

          </button>


          <button
            type="button"
            class="public-seller-action"
            data-action="seller-contact"
            data-store-id="${escapeHTML(store.id)}"
          >

            <span>
              Kontak
            </span>

          </button>


          <button
            type="button"
            class="
              public-seller-action
              public-seller-icon-action
            "
            data-action="seller-suggest"
            data-store-id="${escapeHTML(store.id)}"
            aria-label="Temukan akun serupa"
          >

            <i
              class="ph ph-user-plus"
              aria-hidden="true"
            ></i>

          </button>


        </div>

      </section>


      <!-- =====================================
           STORE SHORTCUT
           ===================================== -->

      <button
        type="button"
        class="public-seller-store-link"
        data-action="store-detail"
        data-store-id="${escapeHTML(store.id)}"
      >

        <div class="public-seller-store-icon">

          <i
            class="ph ph-storefront"
            aria-hidden="true"
          ></i>

        </div>


        <div>

          <strong>
            Lihat Toko
          </strong>

          <span>
            ${sellerProducts.length}
            produk tersedia
          </span>

        </div>


        <i
          class="ph ph-caret-right"
          aria-hidden="true"
        ></i>

      </button>


      <!-- =====================================
           PUBLIC TABS
           ===================================== -->

      <nav
        class="social-account-tabs"
        aria-label="Konten penjual"
      >

        <button
          type="button"
          class="social-account-tab"
          data-action="seller-public-tab"
          data-tab="posts"
          data-store-id="${escapeHTML(store.id)}"
          aria-label="Postingan"
        >
          <i
            class="ph ph-squares-four"
          ></i>
        </button>


        <button
          type="button"
          class="
            social-account-tab
            active
          "
          data-action="seller-public-tab"
          data-tab="products"
          data-store-id="${escapeHTML(store.id)}"
          aria-label="Produk"
        >
          <i
            class="ph ph-shopping-bag"
          ></i>
        </button>

      </nav>


      <div id="publicSellerContent">
        ${productGrid}
      </div>


    </section>
  `,window.scrollTo({top:0,behavior:"auto"})}function openSellerContact(storeId){const store=getStores().find(item=>String(item.id)===String(storeId));if(!store){showToast("UMKM tidak ditemukan.");return}let whatsappNumber=String(store.whatsapp||store.phone||"").replace(/\D/g,"");whatsappNumber.startsWith("0")&&(whatsappNumber="62"+whatsappNumber.slice(1));const phoneNumber=String(store.phone||"").replace(/[^\d+]/g,""),whatsappHTML=whatsappNumber?`
          <a
            href="https://wa.me/${escapeHTML(whatsappNumber)}"
            target="_blank"
            rel="noopener noreferrer"
            class="menu-sheet-btn"
          >
            <i
              class="ph ph-whatsapp-logo"
              aria-hidden="true"
            ></i>

            <span>
              WhatsApp
            </span>
          </a>
        `:"",phoneHTML=phoneNumber?`
          <a
            href="tel:${escapeHTML(phoneNumber)}"
            class="menu-sheet-btn"
          >
            <i
              class="ph ph-phone"
              aria-hidden="true"
            ></i>

            <span>
              Telepon
            </span>
          </a>
        `:"",contactHTML=whatsappHTML||phoneHTML?`
          ${whatsappHTML}
          ${phoneHTML}
        `:`
          <section class="empty-state">

            <i
              class="ph ph-address-book"
              aria-hidden="true"
            ></i>

            <strong class="empty-state-title">
              Kontak belum tersedia
            </strong>

            <p class="empty-state-text">
              UMKM ini belum menambahkan
              nomor WhatsApp atau telepon.
            </p>

          </section>
        `;openBottomSheet(`
      <h2 id="sheetTitle">
        Kontak ${escapeHTML(store.name||"UMKM")}
      </h2>

      ${contactHTML}
    `,"seller-contact")}function openSimilarStores(storeId){const currentStore=getStores().find(item=>String(item.id)===String(storeId));if(!currentStore){showToast("UMKM tidak ditemukan.");return}const allOtherStores=getStores().filter(store=>String(store.id)!==String(currentStore.id)),sameCategory=currentStore.category?allOtherStores.filter(store=>normalizeText(store.category)===normalizeText(currentStore.category)):[],suggestions=(sameCategory.length?sameCategory:allOtherStores).slice(0,5);if(!suggestions.length){openBottomSheet(`
        <h2 id="sheetTitle">
          UMKM Serupa
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-storefront"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada rekomendasi
          </strong>

          <p class="empty-state-text">
            UMKM serupa akan tampil
            setelah lebih banyak usaha bergabung.
          </p>

        </section>
      `,"seller-suggest");return}const html=suggestions.map(store=>`
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="seller-profile"
          data-store-id="${escapeHTML(store.id)}"
        >

          <i
            class="ph ph-storefront"
            aria-hidden="true"
          ></i>

          <span>
            ${escapeHTML(store.name||"UMKM Lokal")}

            ${store.category?`
                    <small>
                      ${escapeHTML(store.category)}
                    </small>
                  `:""}

          </span>

        </button>
      `).join("");openBottomSheet(`
      <h2 id="sheetTitle">
        UMKM Serupa
      </h2>

      ${html}
    `,"seller-suggest")}function switchPublicSellerTab(storeId,tab,button){const store=getStores().find(item=>String(item.id)===String(storeId));if(!store){showToast("Profil UMKM tidak ditemukan.");return}const page=document.querySelector(".public-seller-profile");if(!page)return;page.querySelectorAll(".social-account-tab").forEach(item=>{item.classList.toggle("active",item===button)});const content=page.querySelector("#publicSellerContent");if(!content)return;const sellerFeedItems=DATA.posts.filter(post=>String(post.store?.id)===String(store.id)),sellerPosts=sellerFeedItems.filter(post=>!post.product);if(tab==="posts"){if(!sellerPosts.length){content.innerHTML=`
      <section class="social-account-empty">

        <div class="social-account-empty-icon">
          <i class="ph ph-squares-four"></i>
        </div>

        <strong>
          Belum ada postingan
        </strong>

        <p>
          Postingan dari UMKM ini
          akan tampil di sini.
        </p>

      </section>
    `;return}content.innerHTML=`
    <div
      class="
        social-account-grid
        social-account-post-grid
        public-seller-post-grid
      "
    >

      ${sellerPosts.map(post=>`
          <button
            type="button"
            class="
              social-account-grid-item
              social-account-post-item
              public-seller-post-item
            "
            data-action="seller-post-open"
            data-store-id="${escapeHTML(store.id||"")}"
            data-post-id="${escapeHTML(post.id||"")}"
            aria-label="Buka postingan ${escapeHTML(post.caption||store.name||"UMKM")}"
          >

            <img
              src="${escapeHTML(post.media?.src||ASSETS.logo)}"
              alt="${escapeHTML(post.media?.alt||post.caption||"Postingan UMKM")}"
              loading="lazy"
              decoding="async"
            >

          </button>
        `).join("")}

    </div>
  `;return}const sellerProducts=sellerFeedItems.filter(post=>post.product?.id).map(post=>post.product);if(!sellerProducts.length){content.innerHTML=`
      <section class="social-account-empty">

        <div class="social-account-empty-icon">
          <i class="ph ph-shopping-bag"></i>
        </div>

        <strong>
          Belum ada produk
        </strong>

        <p>
          Produk dari UMKM ini
          akan tampil di sini.
        </p>

      </section>
    `;return}content.innerHTML=`
    <div class="social-account-product-grid">

      ${sellerProducts.map(product=>{const image=product.image||product.image_url||product.thumbnail_url||ASSETS.logo;return`
            <article
              class="social-product-card"
              data-action="product-detail"
              data-product-id="${escapeHTML(product.id||"")}"
            >

              <div class="social-product-media">

                <img
                  src="${escapeHTML(image)}"
                  alt="${escapeHTML(product.name||"Produk UMKM")}"
                  loading="lazy"
                  decoding="async"
                >

              </div>


              <div class="social-product-body">

                ${product.category?`
                        <span class="social-product-category">
                          ${escapeHTML(product.category)}
                        </span>
                      `:""}


                <strong class="social-product-name">
                  ${escapeHTML(product.name||"Produk UMKM")}
                </strong>


                <div class="social-product-price">
                  ${formatRupiah(product.price)}
                </div>


                <div class="social-product-stock">

                  <i
                    class="ph ph-package"
                    aria-hidden="true"
                  ></i>

                  <span>
                    Stok
                    ${escapeHTML(String(product.stock??0))}

                    ${product.unit?escapeHTML(product.unit):""}
                  </span>

                </div>

              </div>

            </article>
          `}).join("")}

    </div>
  `}function openOrders(){if(!STATE.user){showToast("Masuk untuk melihat pesanan."),openLogin();return}if(!DATA.orders.length){openBottomSheet(`
        <h2 id="sheetTitle">
          Pesanan Saya
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-receipt"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada pesanan
          </strong>

          <p class="empty-state-text">
            Riwayat transaksi akan muncul di sini.
          </p>

        </section>
      `,"orders");return}}function openFavorites(){const posts=DATA.posts.filter(post=>STATE.savedPosts.has(String(post.id)));if(!posts.length){openBottomSheet(`
        <h2 id="sheetTitle">
          Favorit
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-heart"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada favorit
          </strong>

          <p class="empty-state-text">
            Produk dan postingan yang disimpan
            akan muncul di sini.
          </p>

        </section>
      `,"favorites");return}closeBottomSheet(),renderFeed(posts)}function openAbout(){openBottomSheet(`
      <h2 id="sheetTitle">
        Tentang Pasar UMKM
      </h2>

      <section class="empty-state">

        <img
          src="${escapeHTML(ASSETS.logo)}"
          alt="Pasar UMKM"
          class="side-menu-logo"
        >

        <strong
          class="empty-state-title"
          style="margin-top:16px;"
        >
          Pasar UMKM
        </strong>

        <p class="empty-state-text">
          Platform digital untuk membantu masyarakat
          menemukan, mengenal, dan mendukung UMKM lokal
          di Lubuklinggau.
        </p>

      </section>


      <section
        class="side-account"
        style="margin-top:14px;"
      >

        <p class="side-menu-footer-label">
          Inisiatif
        </p>

        <strong class="side-menu-footer-name">
          ${escapeHTML(CONFIG.ORGANIZATION)}
        </strong>


        <p
          class="side-menu-footer-label"
          style="margin-top:12px;"
        >
          Founder & Product Initiator
        </p>

        <strong class="side-menu-footer-name">
          ${escapeHTML(CONFIG.INITIATOR)}
        </strong>

      </section>
    `,"about")}function openHelp(){openBottomSheet(`
      <h2 id="sheetTitle">
        Pusat Bantuan
      </h2>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-shopping-bag"></i>
        Cara berbelanja
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-storefront"></i>
        Cara mendaftarkan UMKM
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-shield-check"></i>
        Keamanan akun
      </button>

      <button
        type="button"
        class="menu-sheet-btn"
      >
        <i class="ph ph-question"></i>
        Pertanyaan umum
      </button>
    `,"help")}function openSellerStore(){openBottomSheet(createInformationState("Kelola Toko","storefront","Profil toko, alamat, informasi usaha, dan pengaturan UMKM akan dikelola di sini."),"seller-store")}function openSellerProducts(){openBottomSheet(createInformationState("Produk Saya","package","Produk yang telah diterbitkan akan dikelola dari halaman ini."),"seller-products")}function openAdmin(){openBottomSheet(createInformationState("Panel Pengelola","shield-check","Moderasi UMKM, produk, laporan, dan pengelolaan platform akan tersedia di sini."),"admin")}function openStory(storyId){const story=DATA.stories.find(item=>String(item.id)===String(storyId));story&&openBottomSheet(`
      <h2 id="sheetTitle">
        ${escapeHTML(story.name||"Cerita")}
      </h2>

      <section class="empty-state">

        <img
          src="${escapeHTML(story.avatar||ASSETS.logo)}"
          alt=""
          class="story-avatar"
        >

        <p class="empty-state-text">
          Konten cerita akan dimuat dari server.
        </p>

      </section>
    `,"story")}function openAddStory(){if(!STATE.user){openLogin();return}openBottomSheet(createInformationState("Buat Cerita","camera","Pemilik UMKM dapat membagikan foto atau video singkat dari sini."),"add-story")}function openSearch(){DOM.searchOverlay&&(closeSideMenu(),DOM.searchOverlay.hidden=!1,DOM.searchOverlay.setAttribute("aria-hidden","false"),STATE.searchOpen=!0,lockBodyScroll(),renderSearchHint(),window.setTimeout(()=>{DOM.searchInput?.focus()},30))}function closeSearch(){DOM.searchOverlay&&(DOM.searchOverlay.hidden=!0,DOM.searchOverlay.setAttribute("aria-hidden","true"),STATE.searchOpen=!1,unlockBodyScroll())}function handleSearchInput(event){const query=event.target.value.trim();if(STATE.searchQuery=query,DOM.searchClearButton&&(DOM.searchClearButton.hidden=query.length===0),query.length<CONFIG.SEARCH_MIN_LENGTH){renderSearchHint();return}renderSearchResults(query)}function renderSearchHint(){DOM.searchResults&&(DOM.searchResults.innerHTML=`
    <section class="empty-state">

      <i
        class="ph ph-magnifying-glass"
        aria-hidden="true"
      ></i>

      <strong class="empty-state-title">
        Cari di Pasar UMKM
      </strong>

      <p class="empty-state-text">
        Cari produk, kategori, atau nama UMKM.
      </p>

    </section>
  `)}function renderSearchResults(query){if(!DOM.searchResults)return;const normalized=normalizeText(query),matchedCategories=CATEGORIES.filter(category=>normalizeText(category.name).includes(normalized)),matchedPosts=DATA.posts.filter(post=>{const searchable=[post.product?.name,post.product?.category,post.store?.name,post.caption].filter(Boolean).join(" ");return normalizeText(searchable).includes(normalized)});if(!matchedCategories.length&&!matchedPosts.length){DOM.searchResults.innerHTML=`
      <section class="empty-state">

        <i
          class="ph ph-magnifying-glass"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Tidak ditemukan
        </strong>

        <p class="empty-state-text">
          Tidak ada hasil untuk
          \u201C${escapeHTML(query)}\u201D.
        </p>

      </section>
    `;return}const categoryHTML=matchedCategories.map(category=>`
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="category"
          data-category-id="${escapeHTML(category.id)}"
        >
          <i class="ph ph-${escapeHTML(category.icon)}"></i>

          ${escapeHTML(category.name)}
        </button>
      `).join(""),postHTML=matchedPosts.map(post=>{const product=post.product||{},store=post.store||{},image=product.image||ASSETS.logo;return`
        <button
          type="button"
          class="search-product-result"
          data-action="search-post"
          data-post-id="${escapeHTML(post.id)}"
        >

          <div class="search-product-thumb">

            <img
              src="${escapeHTML(image)}"
              alt="${escapeHTML(product.name||"Produk UMKM")}"
              loading="lazy"
              decoding="async"
            >

          </div>


          <div class="search-product-copy">

            <strong class="search-product-name">
              ${escapeHTML(product.name||"Produk UMKM")}
            </strong>


            <span class="search-product-store">
              ${escapeHTML(store.name||"UMKM Lokal")}
            </span>


            <span class="search-product-price">
              ${formatRupiah(product.price||0)}
            </span>

          </div>


          <i
            class="ph ph-caret-right search-product-arrow"
            aria-hidden="true"
          ></i>

        </button>
      `}).join("");DOM.searchResults.innerHTML=`
  ${categoryHTML?`
          <section class="search-result-group">

            <div class="search-result-group-head">

              <span>
                Kategori
              </span>

              <small>
                ${matchedCategories.length}
              </small>

            </div>

            <div class="search-result-group-list">
              ${categoryHTML}
            </div>

          </section>
        `:""}


  ${postHTML?`
          <section class="search-result-group">

            <div class="search-result-group-head">

              <span>
                Produk
              </span>

              <small>
                ${matchedPosts.length}
              </small>

            </div>

            <div class="search-result-group-list">
              ${postHTML}
            </div>

          </section>
        `:""}
`}function clearSearch(){STATE.searchQuery="",DOM.searchInput&&(DOM.searchInput.value="",DOM.searchInput.focus()),DOM.searchClearButton&&(DOM.searchClearButton.hidden=!0),renderSearchHint()}function openNotifications(){if(!STATE.user){showToast("Masuk terlebih dahulu untuk melihat notifikasi."),openLogin();return}if(!DATA.notifications.length){openBottomSheet(`
        <h2 id="sheetTitle">
          Notifikasi
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-bell"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada notifikasi
          </strong>

          <p class="empty-state-text">
            Aktivitas akun, produk, dan transaksi
            akan muncul di sini.
          </p>

        </section>
      `,"notifications");return}const notifications=DATA.notifications.map(notification=>`
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="notification-item"
          data-notification-id="${escapeHTML(notification.id)}"
        >
          <i class="${getNotificationIcon(notification.type)}"></i>

          ${escapeHTML(notification.title||"Notifikasi")}
        </button>
      `).join("");openBottomSheet(`
      <h2 id="sheetTitle">
        Notifikasi
      </h2>

      <button
        type="button"
        class="menu-sheet-btn"
        data-action="mark-all-read"
      >
        <i class="ph ph-checks"></i>
        Tandai semua sudah dibaca
      </button>

      ${notifications}
    `,"notifications")}function openNotificationTarget(notificationId){const notification=DATA.notifications.find(item=>String(item.id)===String(notificationId));notification&&(notification.unread=!1,updateHeaderBadges(),notification.targetType==="post"&&notification.targetId&&(closeBottomSheet(),scrollToPost(notification.targetId)))}function markAllNotificationsRead(){DATA.notifications.forEach(item=>{item.unread=!1}),updateHeaderBadges(),closeBottomSheet(),showToast("Semua notifikasi sudah dibaca.")}function getNotificationIcon(type){switch(type){case"like":return"ph ph-heart";case"comment":return"ph ph-chat-circle";case"order":return"ph ph-receipt";case"store":return"ph ph-storefront";default:return"ph ph-bell"}}function openSellerMessage(storeId){const store=getStores().find(item=>String(item.id)===String(storeId));if(!store){showToast("UMKM tidak ditemukan.");return}if(!STATE.user){showToast("Masuk terlebih dahulu untuk mengirim pesan."),openLogin();return}openBottomSheet(`
      <h2 id="sheetTitle">
        Pesan ${escapeHTML(store.name||"UMKM")}
      </h2>

      <section class="empty-state">

        <i
          class="ph ph-chat-circle"
          aria-hidden="true"
        ></i>

        <strong class="empty-state-title">
          Percakapan segera tersedia
        </strong>

        <p class="empty-state-text">
          Fitur chat langsung antara pembeli
          dan UMKM sedang disiapkan.
        </p>

      </section>
    `,"seller-message")}function openMessages(){if(!STATE.user){showToast("Masuk terlebih dahulu untuk melihat pesan."),openLogin();return}if(!DATA.messages.length){openBottomSheet(`
        <h2 id="sheetTitle">
          Pesan
        </h2>

        <section class="empty-state">

          <i
            class="ph ph-chat-circle"
            aria-hidden="true"
          ></i>

          <strong class="empty-state-title">
            Belum ada percakapan
          </strong>

          <p class="empty-state-text">
            Percakapan antara pembeli dan UMKM
            akan muncul di sini.
          </p>

        </section>
      `,"messages");return}const messages=DATA.messages.map(message=>`
        <button
          type="button"
          class="menu-sheet-btn"
          data-action="message-item"
          data-message-id="${escapeHTML(message.id)}"
        >
          <i class="ph ph-chat-circle"></i>

          ${escapeHTML(message.title||message.name||"Percakapan")}
        </button>
      `).join("");openBottomSheet(`
      <h2 id="sheetTitle">
        Pesan
      </h2>

      ${messages}
    `,"messages")}function openMessage(messageId){const message=DATA.messages.find(item=>String(item.id)===String(messageId));message&&(message.unread=!1,updateHeaderBadges(),openBottomSheet(createInformationState(message.title||message.name||"Percakapan","chat-circle","Isi percakapan akan dimuat dari server."),"message-thread"))}function updateHeaderBadges(){const notificationBadge=DOM.notificationButton?.querySelector(".badge-dot"),messageBadge=DOM.messageButton?.querySelector(".badge-dot"),notificationsCount=DATA.notifications.filter(item=>item.unread).length,messagesCount=DATA.messages.filter(item=>item.unread).length;setBadge(notificationBadge,notificationsCount),setBadge(messageBadge,messagesCount)}function updateCartBadge(){if(!DOM.navigation)return;const badge=DOM.navigation.querySelector(".nav-badge"),count=STATE.cart.reduce((total,item)=>total+Number(item.quantity||0),0);setBadge(badge,count)}function setBadge(element,count){if(element){if(count=Number(count)||0,count<=0){element.hidden=!0,element.textContent="";return}element.hidden=!1,element.textContent=count>99?"99+":String(count)}}function openBottomSheet(html,type="generic"){if(!DOM.bottomSheet||!DOM.sheetOverlay||!DOM.sheetContent)return;const alreadyOpen=DOM.bottomSheet.hidden===!1&&STATE.activeSheet!==null;DOM.sheetContent.innerHTML=html,DOM.sheetOverlay.hidden=!1,DOM.bottomSheet.hidden=!1,STATE.activeSheet=type,alreadyOpen||lockBodyScroll(),requestAnimationFrame(()=>{DOM.sheetOverlay.classList.add("show"),DOM.bottomSheet.classList.add("show")})}function closeBottomSheet(){!DOM.bottomSheet||!DOM.sheetOverlay||(DOM.sheetOverlay.classList.remove("show"),DOM.bottomSheet.classList.remove("show"),STATE.activeSheet=null,window.setTimeout(()=>{DOM.sheetOverlay.hidden=!0,DOM.bottomSheet.hidden=!0,DOM.sheetContent&&(DOM.sheetContent.innerHTML="")},290),unlockBodyScroll())}function handleScroll(){DOM.header?.classList.toggle("scrolled",window.scrollY>5)}function handleKeyboard(event){if(event.key==="Escape"){if(STATE.searchOpen){closeSearch();return}if(STATE.activeSheet){closeBottomSheet();return}STATE.menuOpen&&closeSideMenu()}}let bodyLockDepth=0;function lockBodyScroll(){bodyLockDepth+=1,document.body.style.overflow="hidden"}function unlockBodyScroll(){bodyLockDepth=Math.max(0,bodyLockDepth-1),bodyLockDepth===0&&(document.body.style.overflow="")}function findPost(postId){return DATA.posts.find(post=>String(post.id)===String(postId))||null}function findProduct(productId){for(const post of DATA.posts)if(String(post.product?.id)===String(productId))return post.product;return null}function findCategoryIdByName(name){return name&&CATEGORIES.find(category=>normalizeText(category.name)===normalizeText(name))?.id||null}function getVisiblePosts(){if(!STATE.activeCategory)return DATA.posts;const category=CATEGORIES.find(item=>item.id===STATE.activeCategory);return category?DATA.posts.filter(post=>normalizeText(post.product?.category)===normalizeText(category.name)||normalizeText(post.product?.categoryId)===normalizeText(category.id)):DATA.posts}function getStores(){if(DATA.stores.length)return DATA.stores;const stores=new Map;return DATA.posts.forEach(post=>{const store=post.store;store?.id&&(stores.has(String(store.id))||stores.set(String(store.id),store))}),[...stores.values()]}function scrollToPost(postId){STATE.activeCategory=null,STATE.activeNav="home",renderFeed(),updateNavigation(),requestAnimationFrame(()=>{const target=document.getElementById(`post-${postId}`);if(!target){showToast("Postingan tidak ditemukan.");return}target.scrollIntoView({behavior:"smooth",block:"center"})})}function saveLocalState(){const payload={likedPosts:[...STATE.likedPosts],savedPosts:[...STATE.savedPosts],cart:STATE.cart};try{localStorage.setItem(CONFIG.STORAGE_KEY,JSON.stringify(payload))}catch(error){console.warn("[Pasar UMKM] Local storage error:",error)}}function restoreLocalState(){try{const raw=localStorage.getItem(CONFIG.STORAGE_KEY);if(!raw)return;const saved=JSON.parse(raw);Array.isArray(saved.likedPosts)&&(STATE.likedPosts=new Set(saved.likedPosts.map(String))),Array.isArray(saved.savedPosts)&&(STATE.savedPosts=new Set(saved.savedPosts.map(String))),Array.isArray(saved.cart)&&(STATE.cart=saved.cart)}catch(error){console.warn("[Pasar UMKM] Restore error:",error)}}function setLoading(value){STATE.loading=!!value,DOM.loading&&(DOM.loading.hidden=!STATE.loading)}let toastTimeout=null;function showToast(message){DOM.toast&&(window.clearTimeout(toastTimeout),DOM.toast.textContent=message,DOM.toast.classList.add("show"),toastTimeout=window.setTimeout(()=>{DOM.toast.classList.remove("show")},CONFIG.TOAST_DURATION))}function createInformationState(title,icon,description){return`
    <h2 id="sheetTitle">
      ${escapeHTML(title)}
    </h2>

    <section class="empty-state">

      <i
        class="ph ph-${escapeHTML(icon)}"
        aria-hidden="true"
      ></i>

      <strong class="empty-state-title">
        ${escapeHTML(title)}
      </strong>

      <p class="empty-state-text">
        ${escapeHTML(description)}
      </p>

    </section>
  `}function formatRupiah(value){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",minimumFractionDigits:0,maximumFractionDigits:0}).format(Number(value)||0)}function formatCompactNumber(value){const number=Number(value)||0;return new Intl.NumberFormat("id-ID",{notation:number>=1e3?"compact":"standard",maximumFractionDigits:1}).format(number)}function formatRelativeTime(value){if(!value)return"";const date=new Date(value);if(Number.isNaN(date.getTime()))return"";let seconds=Math.floor((Date.now()-date.getTime())/1e3);if(seconds<0&&(seconds=0),seconds<60)return"baru saja";const minutes=Math.floor(seconds/60);if(minutes<60)return`${minutes} menit`;const hours=Math.floor(minutes/60);if(hours<24)return`${hours} jam`;const days=Math.floor(hours/24);return days<7?`${days} hari`:new Intl.DateTimeFormat("id-ID",{day:"numeric",month:"short",year:date.getFullYear()!==new Date().getFullYear()?"numeric":void 0}).format(date)}function ensureArray(value){return Array.isArray(value)?value:[]}function normalizeText(value){return String(value||"").trim().toLocaleLowerCase("id-ID")}function cloneData(value){return typeof structuredClone=="function"?structuredClone(value):JSON.parse(JSON.stringify(value))}function escapeHTML(value){return value==null?"":String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}window.PasarUMKM=Object.freeze({getState(){return STATE},getData(){return DATA},getCategories(){return CATEGORIES},refresh(){renderApplication()},clearLocalState(){localStorage.removeItem(CONFIG.STORAGE_KEY),window.location.reload()},resetSplash(){sessionStorage.removeItem(CONFIG.INTRO_KEY),window.location.reload()}});
