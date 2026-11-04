import { useState } from 'react';
import { ContainerFreightTracker } from '../components/containers/ContainerFreightTracker';
import { handleImageError } from '@/utils/imageFallback';

interface ContainerProductItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  image?: string;
  reason: string;
}

interface ContainerRuleItem {
  id: string;
  ruleType: string;
  value: string;
}

interface ContainerModel {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: string;
  icon: string;
  displayMode: 'grid' | 'carousel' | 'list' | 'featured';
  itemsPerRow: number;
  maxItems: number;
  isActive: boolean;
  sortOrder: number;
  bgColor: string;
  products: ContainerProductItem[];
  rules: ContainerRuleItem[];
}

interface SellerSubmission {
  id: string;
  sellerName: string;
  containerName: string;
  productName: string;
  pitch: string;
  proposedPrice?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export function ContainersAdminPage() {
  const [containers, setContainers] = useState<ContainerModel[]>([
    {
      id: 'c-trending',
      slug: 'trending-now',
      name: '🔥 Trending Products',
      description: 'Most popular items flying off the shelves this week',
      type: 'TRENDING',
      icon: '🔥',
      displayMode: 'carousel',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 1,
      bgColor: '#ffffff',
      products: [],
      rules: [],
    },
    {
      id: 'c-deals',
      slug: 'daily-deals',
      name: '⚡ Limited Time Deals',
      description: 'Unbeatable price cuts guaranteed on top rated brands',
      type: 'DEALS',
      icon: '⚡',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 2,
      bgColor: '#fff8f6',
      products: [],
      rules: [{ id: 'cr-1', ruleType: 'DISCOUNT_PERCENTAGE', value: 'Min Discount 10%' }],
    },
    {
      id: 'c-new',
      slug: 'new-arrivals',
      name: '✨ New Arrivals',
      description: 'Fresh products just added to MUNI platform across East Africa',
      type: 'NEW_ARRIVALS',
      icon: '✨',
      displayMode: 'carousel',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 3,
      bgColor: '#ffffff',
      products: [],
      rules: [],
    },
    {
      id: 'c-department',
      slug: 'shop-by-department',
      name: '🏬 Shop by Department',
      description: 'Browse top departments and category hubs',
      type: 'CATEGORY',
      icon: '🏬',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 4,
      bgColor: '#ffffff',
      products: [],
      rules: [],
    },
    {
      id: 'c-top-picks',
      slug: 'top-picks',
      name: '⭐ Top Picks',
      description: 'Highly rated customer favorites across all categories',
      type: 'RECOMMENDED',
      icon: '⭐',
      displayMode: 'carousel',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 5,
      bgColor: '#ffffff',
      products: [],
      rules: [],
    },
    {
      id: 'c-appliances',
      slug: 'appliances',
      name: '🔌 Appliances',
      description: 'Kitchen electronics, air fryers & smart home devices',
      type: 'CATEGORY',
      icon: '🔌',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 6,
      bgColor: '#ffffff',
      products: [],
      rules: [{ id: 'cr-2', ruleType: 'CATEGORY', value: 'Category = Appliances' }],
    },
    {
      id: 'c-fashion',
      slug: 'fashion',
      name: '👗 Fashion',
      description: 'Trending shoes, apparel, watches and accessories',
      type: 'CATEGORY',
      icon: '👗',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 7,
      bgColor: '#ffffff',
      products: [],
      rules: [{ id: 'cr-3', ruleType: 'CATEGORY', value: 'Category = Fashion' }],
    },
    {
      id: 'c-home',
      slug: 'home-kitchen',
      name: '🛋️ Home & Kitchen',
      description: 'Ergonomic furniture & home decor',
      type: 'CATEGORY',
      icon: '🛋️',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 8,
      bgColor: '#ffffff',
      products: [],
      rules: [{ id: 'cr-4', ruleType: 'CATEGORY', value: 'Category = Home & Kitchen' }],
    },
    {
      id: 'c-beauty',
      slug: 'beauty',
      name: '💄 Beauty',
      description: 'Skincare, cosmetics & grooming',
      type: 'CATEGORY',
      icon: '💄',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 9,
      bgColor: '#ffffff',
      products: [],
      rules: [{ id: 'cr-5', ruleType: 'CATEGORY', value: 'Category = Beauty' }],
    },
    {
      id: 'c-sports',
      slug: 'sports',
      name: '⚽ Sports',
      description: 'Athletic equipment, gym gear & activewear',
      type: 'CATEGORY',
      icon: '⚽',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 10,
      bgColor: '#ffffff',
      products: [],
      rules: [{ id: 'cr-6', ruleType: 'CATEGORY', value: 'Category = Sports' }],
    },
  ]);

  const [submissions, setSubmissions] = useState<SellerSubmission[]>([]);

  const [activeTab, setActiveTab] = useState<'containers' | 'csv' | 'upload' | 'db' | 'nominations' | 'freight'>('containers');
  const [selectedContainerId, setSelectedContainerId] = useState<string>('c-trending');

  // Single Pin Form Inputs
  const [pinProductId, setPinProductId] = useState('');
  const [pinProductName, setPinProductName] = useState('');
  const [pinReason] = useState('Admin Feature Pin');

  // METHOD 1: Local Image Upload State
  const [localImageBase64, setLocalImageBase64] = useState<string | null>(null);
  const [imageTargetProductId, setImageTargetProductId] = useState('p-101');

  // METHOD 2: CSV/Excel Import State
  const [, setCsvRawText] = useState<string>('');
  const [parsedCsvItems, setParsedCsvItems] = useState<Array<{ productId: string; name: string; price: number; reason: string }>>([]);

  const [notification, setNotification] = useState('');

  const selectedContainer = containers.find((c) => c.id === selectedContainerId);

  // METHOD 1: Local Image File Handler
  const handleLocalImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLocalImageBase64(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApplyLocalImage = () => {
    if (!localImageBase64 || !selectedContainerId) return;

    setContainers(
      containers.map((c) => {
        if (c.id === selectedContainerId) {
          return {
            ...c,
            products: c.products.map((p) =>
              p.productId === imageTargetProductId ? { ...p, image: localImageBase64 } : p
            ),
          };
        }
        return c;
      })
    );

    setNotification(`Local image assigned to product '${imageTargetProductId}' in ${selectedContainer?.name}!`);
    setTimeout(() => setNotification(''), 3000);
  };

  // METHOD 2: CSV/Excel File Handler & Parser
  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvRawText(text);

        // Simple CSV parser: productId, name, price, reason
        const lines = text.split('\n');
        const parsed: Array<{ productId: string; name: string; price: number; reason: string }> = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line || line.startsWith('productId')) continue;
          const [pId, pName, pPrice, pReason] = line.split(',').map((s) => s.trim());
          if (pId) {
            parsed.push({
              productId: pId,
              name: pName || `Product ${pId}`,
              price: Number(pPrice) || 120000,
              reason: pReason || 'CSV Bulk Import',
            });
          }
        }
        setParsedCsvItems(parsed);
      };
      reader.readAsText(file);
    }
  };

  const handleExecuteCsvImport = () => {
    if (parsedCsvItems.length === 0 || !selectedContainerId) return;

    setContainers(
      containers.map((c) => {
        if (c.id === selectedContainerId) {
          const newProducts = parsedCsvItems.map((item, idx) => ({
            id: `cp-csv-${Date.now()}-${idx}`,
            productId: item.productId,
            name: item.name,
            price: item.price,
            reason: item.reason,
          }));
          return { ...c, products: [...c.products, ...newProducts] };
        }
        return c;
      })
    );

    setNotification(`Successfully imported ${parsedCsvItems.length} products from CSV to ${selectedContainer?.name}!`);
    setParsedCsvItems([]);
    setCsvRawText('');
    setTimeout(() => setNotification(''), 3500);
  };

  // METHOD 3: Direct Database Insert Handler
  const handleExecuteDirectDbInsert = () => {
    if (!selectedContainerId) return;

    const sampleDbPayload = [
      { id: `cp-db-${Date.now()}-1`, productId: 'p-301', name: 'Direct DB Injected Laptop Stand', price: 95000, reason: 'Direct DB Script Insert' },
      { id: `cp-db-${Date.now()}-2`, productId: 'p-302', name: 'Direct DB Injected USB-C Hub', price: 145000, reason: 'Direct DB Script Insert' },
    ];

    setContainers(
      containers.map((c) => {
        if (c.id === selectedContainerId) {
          return { ...c, products: [...c.products, ...sampleDbPayload] };
        }
        return c;
      })
    );

    setNotification(`Direct Database Insertion complete! 2 items inserted into container '${selectedContainer?.name}'.`);
    setTimeout(() => setNotification(''), 3500);
  };

  const handlePinProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinProductId || !selectedContainerId) return;

    setContainers(
      containers.map((c) => {
        if (c.id === selectedContainerId) {
          return {
            ...c,
            products: [
              ...c.products,
              {
                id: `cp-${Date.now()}`,
                productId: pinProductId,
                name: pinProductName || `Product ${pinProductId}`,
                price: 350000,
                reason: pinReason,
              },
            ],
          };
        }
        return c;
      })
    );

    setNotification(`Product '${pinProductId}' pinned to ${selectedContainer?.name}`);
    setPinProductId('');
    setPinProductName('');
    setTimeout(() => setNotification(''), 3000);
  };

  const handleUnpinProduct = (containerId: string, cpId: string) => {
    setContainers(
      containers.map((c) => {
        if (c.id === containerId) {
          return { ...c, products: c.products.filter((p) => p.id !== cpId) };
        }
        return c;
      })
    );
  };

  const handleEvaluateSubmission = (subId: string, decision: 'APPROVED' | 'REJECTED') => {
    setSubmissions(
      submissions.map((s) => (s.id === subId ? { ...s, status: decision } : s))
    );
    setNotification(`Seller submission ${decision.toLowerCase()}!`);
    setTimeout(() => setNotification(''), 3000);
  };

  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Homepage Container & Local Storage Import Hub</h1>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '4px' }}>
          Manage homepage sections using 3 Local Storage import methods (Local File Upload, CSV Bulk Import, and Direct DB Batch Insert)
        </p>
      </div>

      {notification && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', fontWeight: 600 }}>
          ✓ {notification}
        </div>
      )}

      {/* Method Tabs Header */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('containers')}
          style={{
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'containers' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'containers' ? '#2563eb' : '#64748b',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          🖼️ Containers ({containers.length})
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          style={{
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'upload' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'upload' ? '#2563eb' : '#64748b',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          1. 🖼️ Local Image Upload
        </button>
        <button
          onClick={() => setActiveTab('csv')}
          style={{
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'csv' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'csv' ? '#2563eb' : '#64748b',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          2. 📊 CSV/Excel Bulk Import
        </button>
        <button
          onClick={() => setActiveTab('db')}
          style={{
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'db' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'db' ? '#2563eb' : '#64748b',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          3. 🗄️ Direct DB Batch Insert
        </button>
        <button
          onClick={() => setActiveTab('nominations')}
          style={{
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'nominations' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'nominations' ? '#2563eb' : '#64748b',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Seller Deal Submissions ({submissions.filter((s) => s.status === 'PENDING').length})
        </button>
        <button
          onClick={() => setActiveTab('freight')}
          style={{
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'freight' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'freight' ? '#2563eb' : '#64748b',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          🚢 Container Freight Tracker
        </button>
      </div>

      {activeTab === 'containers' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
          {/* Left Container List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {containers.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedContainerId(c.id)}
                style={{
                  padding: '16px',
                  background: selectedContainerId === c.id ? '#eff6ff' : '#ffffff',
                  borderRadius: '10px',
                  border: selectedContainerId === c.id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{c.name}</h4>
                  <span style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '8px', fontWeight: 700 }}>
                    {c.displayMode}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#64748b' }}>
                  {c.products.length} pinned products • {c.itemsPerRow} cols
                </p>
              </div>
            ))}
          </div>

          {/* Right Container Product Pinning & Configuration Panel */}
          {selectedContainer && (
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{selectedContainer.name}</h3>
                  <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{selectedContainer.description}</p>
                </div>
                <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
                  Active Container
                </span>
              </div>

              {/* Pin New Product Form */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>📌 Pin Product to this Section</h4>
                <form onSubmit={handlePinProduct} style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    required
                    placeholder="Product ID (e.g. p-104)"
                    value={pinProductId}
                    onChange={(e) => setPinProductId(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                  <input
                    type="text"
                    placeholder="Product Title"
                    value={pinProductName}
                    onChange={(e) => setPinProductName(e.target.value)}
                    style={{ flex: 1.5, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                  <button
                    type="submit"
                    style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                  >
                    + Pin Product
                  </button>
                </form>
              </div>

              {/* Pinned Products List */}
              <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Pinned Products ({selectedContainer.products.length})</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {selectedContainer.products.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {p.image && <img src={p.image} alt={p.name} onError={handleImageError} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />}
                      <div>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>{p.name}</span>
                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '10px' }}>({p.productId}) • UGX {p.price.toLocaleString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnpinProduct(selectedContainer.id, p.id)}
                      style={{ padding: '4px 10px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Unpin
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* METHOD 1: Local Image Upload */}
      {activeTab === 'upload' && (
        <div style={{ maxWidth: 650, background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>Method 1: Local Image Upload</h3>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
            Upload custom product image assets or container banners directly from your local computer.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Select Target Product ID</label>
              <select
                value={imageTargetProductId}
                onChange={(e) => setImageTargetProductId(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                {selectedContainer?.products.map((p) => (
                  <option key={p.id} value={p.productId}>
                    {p.name} ({p.productId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Choose Image File from Computer</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleLocalImageSelect}
                style={{ width: '100%', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            {localImageBase64 && (
              <div style={{ textAlign: 'center', padding: '16px', background: '#f1f5f9', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>Image Preview:</p>
                <img src={localImageBase64} alt="Preview" style={{ maxHeight: 180, borderRadius: 8, border: '1px solid #cbd5e1' }} />
              </div>
            )}

            <button
              onClick={handleApplyLocalImage}
              disabled={!localImageBase64}
              style={{
                padding: '12px',
                background: localImageBase64 ? '#2563eb' : '#cbd5e1',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: localImageBase64 ? 'pointer' : 'not-allowed',
              }}
            >
              Upload & Assign Local Image
            </button>
          </div>
        </div>
      )}

      {/* METHOD 2: CSV/Excel Bulk Import */}
      {activeTab === 'csv' && (
        <div style={{ maxWidth: 700, background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>Method 2: CSV/Excel Bulk Import</h3>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
            Bulk import multiple products at once from local <code>.csv</code> or <code>.xlsx</code> files into <strong>{selectedContainer?.name}</strong>.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Select CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvFileSelect}
                style={{ width: '100%', padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            {parsedCsvItems.length > 0 && (
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '10px', color: '#1e40af' }}>
                  Parsed CSV File Preview ({parsedCsvItems.length} Products)
                </h4>
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {parsedCsvItems.map((item, idx) => (
                    <div key={idx} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', background: '#ffffff', padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                      <span><strong>{item.productId}</strong> — {item.name}</span>
                      <span>UGX {item.price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleExecuteCsvImport}
              disabled={parsedCsvItems.length === 0}
              style={{
                padding: '12px',
                background: parsedCsvItems.length > 0 ? '#16a34a' : '#cbd5e1',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: parsedCsvItems.length > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              Bulk Import {parsedCsvItems.length} Products from CSV
            </button>
          </div>
        </div>
      )}

      {/* METHOD 3: Direct Database Insert */}
      {activeTab === 'db' && (
        <div style={{ maxWidth: 650, background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>Method 3: Direct Database Batch Insert</h3>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
            Execute direct batch database insertion via <code>POST /api/v1/containers/:id/products/bulk</code> for automated scripts and dev testing.
          </p>

          <div style={{ background: '#0f172a', color: '#38bdf8', padding: '16px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px', marginBottom: '20px', lineHeight: 1.6 }}>
            <div>POST /api/v1/containers/{selectedContainerId}/products/bulk</div>
            <div style={{ color: '#94a3b8' }}>Body: &#123; "products": [ &#123; "productId": "p-301", "name": "Laptop Stand" &#125; ] &#125;</div>
          </div>

          <button
            onClick={handleExecuteDirectDbInsert}
            style={{
              padding: '12px 24px',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 800,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            ⚡ Execute Batch DB Insert into {selectedContainer?.name}
          </button>
        </div>
      )}

      {activeTab === 'nominations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {submissions.map((s) => (
            <div key={s.id} style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 800, fontSize: '15px' }}>{s.productName}</span>
                <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                  {s.status}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
                Seller: <strong>{s.sellerName}</strong> • Target Section: <strong>{s.containerName}</strong> • Pitch: <em>"{s.pitch}"</em>
              </p>
              {s.status === 'PENDING' && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleEvaluateSubmission(s.id, 'APPROVED')}
                    style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ✓ Approve & Feature on Homepage
                  </button>
                  <button
                    onClick={() => handleEvaluateSubmission(s.id, 'REJECTED')}
                    style={{ padding: '6px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ✕ Reject Nomination
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'freight' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '4px' }}>Container Freight Tracker</h3>
            <p style={{ fontSize: '13px', color: '#64748b' }}>
              Track cross-border freight containers carrying seller inventory — origin, destination port, transit status, and customs clearance.
            </p>
          </div>
          <ContainerFreightTracker />
        </div>
      )}
    </div>
  );
}
export default ContainersAdminPage;
