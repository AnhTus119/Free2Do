(function () {
  'use strict';

  const data = window.AdminData;

  const PAGE_SIZE = 10;
  const DEFAULT_ROWS = 4;

  let showingAllActivities = false;
  let activityPage = 1;

  let showingAllBusinesses = false;
  let businessPage = 1;

  function currentPendingActivities() {
    return data.activities.filter(
      item => item.status === 'pending'
    );
  }

  function currentPendingBusinesses() {
    return data.businesses.filter(
      item => item.status === 'pending'
    );
  }

  function updateOverview() {
    const stats = document.querySelectorAll(
      '.stats-grid .stat-num'
    );

    const activities = data.activities;
    const customers = data.customers;

    const pendingTotal =
      currentPendingActivities().length +
      currentPendingBusinesses().length;

    const values = [
      customers.length,
      data.businesses.length,
      activities.length,
      activities.filter(
        item => item.status === 'active'
      ).length,
      pendingTotal,
      customers.filter(
        item => item.status === 'locked'
      ).length
    ];

    values.forEach((value, index) => {
      if (stats[index]) {
        stats[index].textContent = value;
      }
    });

    document.getElementById(
      'pendingActivityAlert'
    ).textContent = currentPendingActivities().length;

    document.getElementById(
      'pendingBusinessAlert'
    ).textContent = currentPendingBusinesses().length;

    document.getElementById(
      'missingPhoneAlert'
    ).textContent = data.businesses.filter(
      item => !item.phone
    ).length;

    document.getElementById(
      'lockedCustomerAlert'
    ).textContent = customers.filter(
      item => item.status === 'locked'
    ).length;
  }

  function renderPageButtons(
    container,
    total,
    currentPage,
    onChange
  ) {
    const totalPages = Math.ceil(
      total / PAGE_SIZE
    );

    container.innerHTML = '';

    const add = (
      label,
      page,
      active = false
    ) => {
      const button = document.createElement(
        'button'
      );

      button.className =
        `page-btn${active ? ' active' : ''}`;

      button.textContent = label;

      button.disabled =
        page < 1 || page > totalPages;

      button.addEventListener('click', () => {
        onChange(page);
      });

      container.appendChild(button);
    };

    add('‹', currentPage - 1);

    for (
      let page = 1;
      page <= totalPages;
      page += 1
    ) {
      add(
        String(page),
        page,
        page === currentPage
      );
    }

    add('›', currentPage + 1);
  }

  function renderPendingActivities() {
    const activities =
      currentPendingActivities();

    const start = showingAllActivities
      ? (activityPage - 1) * PAGE_SIZE
      : 0;

    const rows = showingAllActivities
      ? activities.slice(
          start,
          start + PAGE_SIZE
        )
      : activities.slice(0, DEFAULT_ROWS);

    document.getElementById(
      'pendingCount'
    ).textContent = `(${activities.length})`;

    document.getElementById(
      'pendingTableBody'
    ).innerHTML = rows.length
      ? rows.map(activity => `
          <tr>
            <td>
              <div class="cell-title">
                ${data.escapeHTML(activity.name)}
              </div>

              <div class="cell-sub">
                ${data.escapeHTML(activity.category)}
                ·
                ${data.escapeHTML(activity.price)}
              </div>
            </td>

            <td>
              ${data.escapeHTML(
                data.businessName(activity)
              )}
            </td>

            <td>
              ${data.escapeHTML(activity.address)}
            </td>

            <td>
              <span class="badge pending">
                Chờ duyệt
              </span>
            </td>

            <td>
              <div class="row-actions">
                <button
                  class="row-btn viewmore"
                  data-activity-id="${data.escapeHTML(
                    activity.id
                  )}"
                >
                  Xem thêm
                </button>
              </div>
            </td>
          </tr>
        `).join('')
      : `
          <tr>
            <td
              colspan="5"
              style="text-align:center;"
            >
              Không có hoạt động chờ duyệt.
            </td>
          </tr>
        `;

    const pagination =
      document.getElementById(
        'pendingPagination'
      );

    const toggle =
      document.querySelector(
        '#toggleViewAll a'
      );

    toggle.textContent = showingAllActivities
      ? 'Thu gọn ↑'
      : 'Xem tất cả';

    pagination.classList.toggle(
      'show',
      showingAllActivities &&
      activities.length > PAGE_SIZE
    );

    if (
      showingAllActivities &&
      activities.length > PAGE_SIZE
    ) {
      document.getElementById(
        'paginationInfo'
      ).textContent =
        `Hiển thị ${start + 1}–` +
        `${Math.min(
          start + PAGE_SIZE,
          activities.length
        )} trong ${activities.length} hoạt động`;

      renderPageButtons(
        document.getElementById(
          'paginationBtns'
        ),
        activities.length,
        activityPage,
        page => {
          activityPage = page;
          renderPendingActivities();
        }
      );
    }
  }

  function renderPendingBusinesses() {
    const businesses =
      currentPendingBusinesses();

    const start = showingAllBusinesses
      ? (businessPage - 1) * PAGE_SIZE
      : 0;

    const rows = showingAllBusinesses
      ? businesses.slice(
          start,
          start + PAGE_SIZE
        )
      : businesses.slice(0, DEFAULT_ROWS);

    document.getElementById(
      'bizPendingCount'
    ).textContent = `(${businesses.length})`;

    document.getElementById(
      'bizTableBody'
    ).innerHTML = rows.length
      ? rows.map(business => `
          <tr>
            <td>
              <div class="cell-title">
                ${data.escapeHTML(business.name)}
              </div>
            </td>

            <td>
              ${data.escapeHTML(business.type)}
            </td>

            <td>
              ${data.escapeHTML(business.address)}
            </td>

            <td>
              <span class="badge pending">
                Chờ duyệt
              </span>
            </td>

            <td>
              <div class="row-actions">
                <button
                  class="row-btn viewmore"
                  data-business-id="${data.escapeHTML(
                    business.id
                  )}"
                >
                  Xem thêm
                </button>
              </div>
            </td>
          </tr>
        `).join('')
      : `
          <tr>
            <td
              colspan="5"
              style="text-align:center;"
            >
              Không có doanh nghiệp chờ duyệt.
            </td>
          </tr>
        `;

    const pagination =
      document.getElementById(
        'bizPagination'
      );

    const toggle =
      document.querySelector(
        '#toggleBizViewAll a'
      );

    toggle.textContent = showingAllBusinesses
      ? 'Thu gọn ↑'
      : 'Xem tất cả';

    pagination.classList.toggle(
      'show',
      showingAllBusinesses &&
      businesses.length > PAGE_SIZE
    );

    if (
      showingAllBusinesses &&
      businesses.length > PAGE_SIZE
    ) {
      document.getElementById(
        'bizPaginationInfo'
      ).textContent =
        `Hiển thị ${start + 1}–` +
        `${Math.min(
          start + PAGE_SIZE,
          businesses.length
        )} trong ${businesses.length} yêu cầu`;

      renderPageButtons(
        document.getElementById(
          'bizPaginationBtns'
        ),
        businesses.length,
        businessPage,
        page => {
          businessPage = page;
          renderPendingBusinesses();
        }
      );
    }
  }

  const activityModal =
    document.getElementById(
      'activityModal'
    );

  function openActivityModal(id) {
    const activity = data.activities.find(
      item => item.id === id
    );

    if (!activity) {
      return;
    }

    document.getElementById(
      'modalTitle'
    ).textContent = activity.name;

    document.getElementById(
      'modalSub'
    ).textContent =
      `${activity.category} · ${activity.price}`;

    document.getElementById(
      'modalDesc'
    ).textContent = activity.description;

    document.getElementById(
      'modalImage'
    ).className = 'modal-image empty';

    document.getElementById(
      'modalImage'
    ).textContent =
      'Chưa có hình ảnh mô tả';

    const information = [
      [
        'Doanh nghiệp',
        data.businessName(activity)
      ],
      ['Ngân sách', activity.price],
      ['Địa chỉ', activity.address],
      [
        'Vị trí',
        activity.location || 'Chưa cung cấp'
      ],
      ['Giờ hoạt động', activity.hours],
      [
        'Admin xác minh',
        activity.verifiedBy ||
          'Chưa xác minh'
      ]
    ];

    document.getElementById(
      'modalInfo'
    ).innerHTML = information.map(
      ([label, value]) => `
        <div class="info-row">
          <span class="info-label">
            ${data.escapeHTML(label)}
          </span>

          <span class="info-value">
            ${data.escapeHTML(value)}
          </span>
        </div>
      `
    ).join('');

    document.getElementById(
      'modalApprove'
    ).onclick = () => {
      decideActivity(id, 'active');
    };

    document.getElementById(
      'modalReject'
    ).onclick = () => {
      decideActivity(id, 'rejected');
    };

    activityModal.classList.add('open');
  }

  function decideActivity(id, status) {
    data.setStatus(
      'activity',
      id,
      status
    );

    activityModal.classList.remove('open');

    renderAll();
  }

  const businessModal =
    document.getElementById(
      'businessModal'
    );

  function openBusinessModal(id) {
    const business = data.businesses.find(
      item => item.id === id
    );

    if (!business) {
      return;
    }

    document.getElementById(
      'bizModalTitle'
    ).textContent = business.name;

    document.getElementById(
      'bizModalSub'
    ).textContent = business.type;

    document.getElementById(
      'bizModalDesc'
    ).textContent = business.description;

    const information = [
      [
        'Số điện thoại',
        business.phone || 'Chưa cung cấp'
      ],
      ['Giờ mở cửa', business.hours],
      [
        'Giá tham khảo',
        business.priceRange
      ],
      [
        'Admin xác minh',
        business.verifiedBy ||
          'Chưa xác minh'
      ]
    ];

    document.getElementById(
      'bizModalInfo'
    ).innerHTML = information.map(
      ([label, value]) => `
        <div class="info-row">
          <span class="info-label">
            ${data.escapeHTML(label)}
          </span>

          <span class="info-value">
            ${data.escapeHTML(value)}
          </span>
        </div>
      `
    ).join('');

    document.getElementById(
      'bizModalImage'
    ).className = 'modal-image empty';

    document.getElementById(
      'bizModalImage'
    ).textContent =
      'Chưa có hình ảnh minh họa';

    document.getElementById(
      'bizModalLicense'
    ).className =
      'modal-image modal-license empty';

    document.getElementById(
      'bizModalLicense'
    ).textContent =
      'Chưa có minh chứng giấy phép hoạt động';

    document.getElementById(
      'bizModalApprove'
    ).onclick = () => {
      decideBusiness(id, 'active');
    };

    document.getElementById(
      'bizModalReject'
    ).onclick = () => {
      decideBusiness(id, 'rejected');
    };

    businessModal.classList.add('open');
  }

  function decideBusiness(id, status) {
    data.setStatus(
      'business',
      id,
      status
    );

    businessModal.classList.remove('open');

    renderAll();
  }

  function renderAll() {
    updateOverview();
    renderPendingActivities();
    renderPendingBusinesses();
  }

  document.getElementById(
    'toggleViewAll'
  ).addEventListener('click', () => {
    showingAllActivities =
      !showingAllActivities;

    activityPage = 1;

    renderPendingActivities();
  });

  document.getElementById(
    'toggleBizViewAll'
  ).addEventListener('click', () => {
    showingAllBusinesses =
      !showingAllBusinesses;

    businessPage = 1;

    renderPendingBusinesses();
  });

  document.getElementById(
    'pendingTableBody'
  ).addEventListener('click', event => {
    const button = event.target.closest(
      '[data-activity-id]'
    );

    if (button) {
      openActivityModal(
        button.dataset.activityId
      );
    }
  });

  document.getElementById(
    'bizTableBody'
  ).addEventListener('click', event => {
    const button = event.target.closest(
      '[data-business-id]'
    );

    if (button) {
      openBusinessModal(
        button.dataset.businessId
      );
    }
  });

  document.getElementById(
    'modalClose'
  ).addEventListener('click', () => {
    activityModal.classList.remove('open');
  });

  document.getElementById(
    'bizModalClose'
  ).addEventListener('click', () => {
    businessModal.classList.remove('open');
  });

  [activityModal, businessModal].forEach(
    modal => {
      modal.addEventListener(
        'click',
        event => {
          if (event.target === modal) {
            modal.classList.remove('open');
          }
        }
      );
    }
  );

  document.addEventListener(
    'keydown',
    event => {
      if (event.key === 'Escape') {
        activityModal.classList.remove(
          'open'
        );

        businessModal.classList.remove(
          'open'
        );
      }
    }
  );

  renderAll();
})();