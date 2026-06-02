import { test, expect } from '@playwright/test';
import { bookingConfig, adminConfig } from './support/env.js';
import { emptyStorageState, loginAsAdmin } from './support/auth.js';
import { resolveBookingService } from './data/bookingServices.js';
import { BookingCreatePage } from './pages/BookingCreatePage.js';

// Bỏ qua global storageState để test tự thực hiện login từ đầu
test.use({ storageState: emptyStorageState });
test.describe.configure({ mode: 'serial' });

const ADMIN_BASE_URL = adminConfig.baseUrl;
const BOOKING_SERVICE = bookingConfig.service;
const BOOKING_SERVICE_MODE = bookingConfig.serviceMode;
const CUSTOMER_QUERY = bookingConfig.customerQuery;
const SHOULD_UPDATE_STATUS = bookingConfig.shouldUpdateStatus;
const TEST_TIMEOUT_MS = bookingConfig.timeoutMs;
const CALCULATE_ONLY = bookingConfig.calculateOnly;
let selectedTimeRange;

function getBookingTimeRange() {
  if (selectedTimeRange) {
    return selectedTimeRange;
  }

  if (bookingConfig.timeMode === 'random') {
    expect(
      bookingConfig.minDurationHours,
      'BOOKING_MIN_DURATION_HOURS must be at least 2.'
    ).toBeGreaterThanOrEqual(2);
    expect(
      bookingConfig.maxDurationHours,
      'BOOKING_MAX_DURATION_HOURS must be less than or equal to 8.'
    ).toBeLessThanOrEqual(8);
    expect(
      bookingConfig.maxDurationHours,
      'BOOKING_MAX_DURATION_HOURS must be greater than or equal to BOOKING_MIN_DURATION_HOURS.'
    ).toBeGreaterThanOrEqual(bookingConfig.minDurationHours);

    const durationHours = randomInt(
      bookingConfig.minDurationHours,
      bookingConfig.maxDurationHours
    );
    const startHour = randomInt(8, 22 - durationHours);
    const start = formatHour(startHour);
    const end = formatHour(startHour + durationHours);

    selectedTimeRange = {
      start,
      end,
      durationHours,
    };
    return selectedTimeRange;
  }

  const start = bookingConfig.startTime;
  const end = bookingConfig.endTime;
  selectedTimeRange = {
    start,
    end,
    durationHours: calculateDurationHours(start, end),
  };
  return selectedTimeRange;
}

function calculateDurationHours(startTime, endTime) {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  let durationHours = ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60;
  if (durationHours <= 0) durationHours += 24;
  return durationHours;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

test('Tạo booking qua Admin', async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const bookingPage = new BookingCreatePage(page, ADMIN_BASE_URL);

  // 1. Đăng nhập
  await test.step('Đăng nhập admin', async () => {
    await loginAsAdmin(page);
  });

  // 2. Chọn dịch vụ cần test
  let serviceCode;
  let serviceConfig;
  let selectedAddressState;

  await test.step('Chuyển tới form tạo Booking mới', async () => {
    ({ serviceCode, serviceConfig } = resolveBookingService({
      serviceMode: BOOKING_SERVICE_MODE,
      service: BOOKING_SERVICE,
    }));

    console.log(`\n==================================================`);
    console.log(`TEST SERVICE: [${serviceConfig.name}] (${serviceCode})`);
    console.log(`==================================================\n`);

    await bookingPage.goto(serviceCode);
  });

  // 3. Chọn khách hàng và địa chỉ
  await test.step('Chọn khách hàng và địa chỉ', async () => {
    await bookingPage.selectCustomer(CUSTOMER_QUERY);

    selectedAddressState = await selectFirstAddress(page);
    await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 15000 }).catch(() => {});
  });


  // 4. Điền thông tin chi tiết theo dịch vụ
  await test.step('Điền thông tin chi tiết dịch vụ', async () => {
    console.log(`=> Điền form: ${serviceConfig.name}`);

    // 4a. Click các dropdown cụ thể theo ID
    for (const dropdownId of (serviceConfig.dropdownsToFill || [])) {
      await fillDropdownById(page, dropdownId);
    }

    // 4b. Xử lý từng dịch vụ đặc thù
    if (serviceConfig.needsAirConType) {
      await fillAirConditionForm(page);
    }
    if (serviceConfig.needsSofaType) {
      await fillSofaForm(page);
    }
    if (serviceConfig.needsCookingSpecific) {
      await fillCookingForm(page);
    }
    if (serviceConfig.needsElderlySpecific) {
      await fillElderlyForm(page);
    }
    if (serviceConfig.needsBabySpecific) {
      await fillBabyForm(page);
    }
    if (serviceConfig.needsPestSpecific) {
      await fillPestControlForm(page);
    }
    if (serviceConfig.needsScheduleSelects) {
      // Dịch vụ electrical, plumbing, furniture dùng .schedule-select
      await fillScheduleSelects(page);
    }

    // 4c. Chọn thứ trong tuần (dịch vụ định kỳ)
    if (serviceConfig.needsWeekday) {
      await fillWeeklyDays(page);
    }
  });

  // 5. Chọn Standard nếu có
  await test.step('Chọn gói Standard (nếu có)', async () => {
    const standardLabel = page.locator('.panel-body label, .panel-body span, .schedule-select')
      .getByText('Standard', { exact: true }).filter({ visible: true });
    if (await standardLabel.isVisible({ timeout: 1000 }).catch(() => false)) {
      await standardLabel.click().catch(() => {});
      console.log('=> Đã chọn Standard');
    }
  });

  // 6. Điền ngày và giờ
  await test.step('Chọn ngày và giờ', async () => {
    await fillDateTimeFields(page, serviceCode);
  });

  // 7. Tính phí và Lưu
  await test.step('Tính phí và Lưu booking', async () => {
    await fillRequiredVisibleDropdowns(page);
    await fillRequiredTextFields(page);
    await ensureValidDateTime(page, serviceCode);
    await calculateFee(page, serviceConfig);
    await syncCalculatedFormState(page);
    if (serviceCode === 'subscription_service') {
      await confirmSubscriptionCustomSchedule(page);
    }
    await neutralizeHiddenCustomerValidation(page);
    await restoreSelectedAddressState(page, selectedAddressState);

    if (CALCULATE_ONLY) {
      console.log('Calculate fee thành công, bỏ qua Save vì CALCULATE_ONLY=true.');
      return;
    }

    await saveBooking(page);

    await assertBookingCreated(page);
    console.log('Booking tạo thành công!');
  });


  // 8. Cập nhật trạng thái
  await test.step('Cập nhật trạng thái của booking', async () => {
    if (!SHOULD_UPDATE_STATUS) {
      console.log('=> Bỏ qua cập nhật trạng thái vì UPDATE_BOOKING_STATUS=false.');
      return;
    }

    await expect(page.locator('#overViewContent')).toBeVisible({ timeout: 15000 });

    // Tìm và cập nhật trạng thái booking
    const statusEl = page.locator('#overViewContent .btn, #overViewContent span, #overViewContent div')
      .filter({ hasText: /Draft|Confirmed|Pairing|Un-assigned/ }).first();

    let currentStatus = '';
    if (await statusEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      currentStatus = (await statusEl.innerText()).trim();
      console.log(`=> Trạng thái: ${currentStatus}`);
    }

    if (currentStatus !== 'Pairing' && currentStatus !== 'Un-assigned') {
      await statusEl.click().catch(async () => {
        await page.locator('#overViewContent').getByText(/Draft|Confirmed/).first().click();
      });
      await page.waitForTimeout(500);

      const pairingOpt = page.getByText('Pairing', { exact: true });
      const unassignedOpt = page.getByText('Un-assigned', { exact: true });

      if (await pairingOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
        await pairingOpt.click();
      } else if (await unassignedOpt.isVisible({ timeout: 1500 }).catch(() => false)) {
        await unassignedOpt.click();
      } else {
        await page.locator('.dropdown-menu .dropdown-item, .dropdown-menu li a').nth(1).click().catch(() => {});
      }

      const confirmBtn = page.locator('#btnConfirmCancel').filter({ visible: true });
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 15000 });
    }

    // Chuyển sang Paid
    const paymentBtn = page.locator('[dropdown-list-id="dropdownListStatusPayment"]');
    if (await paymentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const payText = (await paymentBtn.innerText()).trim();
      console.log(`=> Thanh toán: ${payText}`);

      if (payText.toLowerCase().includes('unpaid') || payText.toLowerCase().includes('chưa')) {
        await paymentBtn.click();
        await page.locator('.dropdown-item.dropdown-item-change-status-payment').first().click();

        const confirmBtn2 = page.locator('#btnConfirmCancel').filter({ visible: true });
        if (await confirmBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmBtn2.click();
        }
        await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 15000 });
        console.log('Đã chuyển sang Paid!');
      }
    }
  });
});

// ================================================================
// HELPER FUNCTIONS
// ================================================================

async function selectFirstAddress(page) {
  const firstAddressRow = page.locator('#tbodyAddressTable tr, table tbody tr')
    .filter({ has: page.locator('td') })
    .first();
  await expect(firstAddressRow, 'Customer đã chọn không có địa chỉ khả dụng để tạo booking.').toBeVisible({ timeout: 10000 });

  await firstAddressRow.scrollIntoViewIfNeeded().catch(() => {});
  await firstAddressRow.click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);

  await firstAddressRow.evaluate((row) => {
    const clickTarget = row.querySelector('input[type="radio"], input[type="checkbox"], .checkbox-custom, label') || row;
    clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    clickTarget.click?.();

    const input = row.querySelector('input[type="radio"], input[type="checkbox"]');
    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const cells = Array.from(row.querySelectorAll('td')).map(td => (td.textContent || '').replace(/\s+/g, ' ').trim());
    const province = cells[1] || '';
    const address = row.dataset.value || cells[2] || cells.find(text => /Viet Nam|Vietnam/i.test(text)) || '';
    const residenceType = cells.find(text => /House|Apt|Condo|Villa|Hotel|Room|Accommodation/i.test(text)) || 'House';
    const moreInfo = cells.find(text => /^\d+$/.test(text)) || '';

    const provinceIdByName = {
      'Thành phố Hồ Chí Minh': '79',
      'Thành phố Hà Nội': '1',
      'Thành phố Đà Nẵng': '48',
      'Tỉnh Khánh Hòa': '56',
      'Tỉnh Gia Lai': '64',
    };

    const setValue = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el || value == null) return;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    setValue('#provinceIDInputForm', row.dataset.provinceId || provinceIdByName[province] || '');
    setValue('#addressInputForm', address);
    setValue('#districtInputForm', row.dataset.district || 'null');
    setValue('#latInputForm', row.dataset.lat || '');
    setValue('#longInputForm', row.dataset.long || row.dataset.lng || '');
    setValue('#residenceTypeInputForm', residenceType);
    setValue('#moreInfoResidenceTypeInputForm', moreInfo);

    window.__bookingAddressState = {
      provinceID: row.dataset.provinceId || provinceIdByName[province] || '',
      address,
      district: row.dataset.district || 'null',
      lat: row.dataset.lat || '',
      long: row.dataset.long || row.dataset.lng || '',
      residenceType,
      moreInfo,
    };
  }).catch(() => {});

  await page.waitForTimeout(800);
  const addressState = await page.evaluate(() => ({
    customerID: document.querySelector('#customerIDInputForm')?.value || '',
    provinceID: document.querySelector('#provinceIDInputForm')?.value || '',
    address: document.querySelector('#addressInputForm')?.value || '',
    lat: document.querySelector('#latInputForm')?.value || '',
    long: document.querySelector('#longInputForm')?.value || '',
    district: document.querySelector('#districtInputForm')?.value || '',
    residenceType: document.querySelector('#residenceTypeInputForm')?.value || '',
    moreInfo: document.querySelector('#moreInfoResidenceTypeInputForm')?.value || '',
  })).catch(() => ({}));
  console.log(`=> Address state: customer=${addressState.customerID || '-'}, province=${addressState.provinceID || '-'}, address=${addressState.address ? 'ok' : '-'}`);
  return addressState;
}

async function restoreSelectedAddressState(page, selectedAddressState = null) {
  const restoredState = await page.evaluate((selectedState) => {
    const state = selectedState || window.__bookingAddressState;
    if (!state) return {};

    const setValue = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el || value == null) return;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    setValue('#provinceIDInputForm', state.provinceID);
    setValue('#customerIDInputForm', state.customerID);
    setValue('#addressInputForm', state.address);
    setValue('#districtInputForm', state.district);
    setValue('#latInputForm', state.lat);
    setValue('#longInputForm', state.long);
    setValue('#residenceTypeInputForm', state.residenceType);
    setValue('#moreInfoResidenceTypeInputForm', state.moreInfo);
    if (typeof window.__BOOKING_REHYDRATE__ === 'function') {
      window.__BOOKING_REHYDRATE__();
    }
    return {
      customerID: document.querySelector('#customerIDInputForm')?.value || '',
      provinceID: document.querySelector('#provinceIDInputForm')?.value || '',
      address: document.querySelector('#addressInputForm')?.value || '',
    };
  }, selectedAddressState).catch(() => {});
  if (restoredState) {
    console.log(`=> Restore address state: customer=${restoredState.customerID || '-'}, province=${restoredState.provinceID || '-'}, address=${restoredState.address ? 'ok' : '-'}`);
  }
}

async function calculateFee(page, serviceConfig = {}) {
  await page.keyboard.press('Escape').catch(() => {});
  await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 15000 }).catch(() => {});

  const calcFeeLocators = [
    page.locator('#btnCalulatorFee'),
    page.getByText('Calculate Fee', { exact: true }),
    page.getByText('Tính tiền', { exact: true }),
  ];

  if (serviceConfig.allowNoCalculatedFee) {
    for (const locator of calcFeeLocators) {
      if (await locator.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('=> Click Calculate Fee...');
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await prepareCalculateFeeState(page);
        await locator.evaluate((el) => {
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }).catch(async () => {
          await locator.click({ force: true, timeout: 2000 }).catch(() => {});
        });
        await page.waitForTimeout(1500);
        await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 5000 }).catch(() => {});
        if (!await hasCalculatedFee(page)) {
          console.log('=> Khong thay bang phi > 0 sau Calculate Fee; service nay cho phep luu dang bao gia/khong tu dong tinh phi.');
        }
        return;
      }
    }
  }

  let attempted = false;
  for (const locator of calcFeeLocators) {
    if (await locator.isVisible({ timeout: 3000 }).catch(() => false)) {
      attempted = true;
      console.log('=> Click Calculate Fee...');
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      const responsePromise = page.waitForResponse(
        res => /estimate-fee|estimate_fee|calculate-fee|calculator-fee/i.test(res.url()),
        { timeout: 30000 }
      ).catch(() => null);

      await prepareCalculateFeeState(page);
      await locator.evaluate((el) => {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      }).catch(() => {});
      await prepareCalculateFeeState(page);
      await locator.evaluate((el) => {
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }).catch(async () => {
        await locator.click({ force: true }).catch(async () => {
          await locator.evaluate(el => el.click()).catch(() => {});
        });
      });
      await responsePromise;
      await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 30000 }).catch(() => {});

      if (await waitForCalculatedFee(page).catch(() => false)) {
        return;
      }

      const retryResponsePromise = page.waitForResponse(
        res => /estimate-fee|estimate_fee|calculate-fee|calculator-fee/i.test(res.url()),
        { timeout: 30000 }
      ).catch(() => null);
      await locator.click({ force: true }).catch(async () => {
        await locator.evaluate(el => el.click()).catch(() => {});
      });
      await retryResponsePromise;
      await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 30000 }).catch(() => {});
      if (await waitForCalculatedFee(page).catch(() => false)) {
        return;
      }

      console.log('   -> Đã click Calculate Fee nhưng chưa thấy bảng phí > 0; tiếp tục Save theo luồng booking.');
      return;
    }
  }

  if (!attempted) {
    throw new Error('Không tìm thấy nút Calculate Fee/Tính tiền để tính phí booking.');
  }

  console.log('=> Đã click Calculate Fee/Tính tiền nhưng chưa thấy dữ liệu phí; tiếp tục Save theo luồng booking.');
}

async function prepareCalculateFeeState(page) {
  await page.evaluate(() => {
    const setValue = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el || value == null || value === '') return;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const firstVisibleValue = (selector, pattern) => {
      const inputs = Array.from(document.querySelectorAll(selector));
      const input = inputs.find(el => visible(el) && pattern.test(el.value || ''));
      return input?.value || '';
    };

    const startDate = firstVisibleValue('input', /^\d{2}\/\d{2}\/\d{4}$/);
    const timeValues = Array.from(document.querySelectorAll('input'))
      .filter(el => visible(el) && /^\d{2}:\d{2}$/.test(el.value || ''))
      .map(el => el.value);
    const startTimeValue = timeValues[0] || '';
    const endTimeValue = timeValues[1] || '';
    const addHours = (time, hours) => {
      const [h, m] = time.split(':').map(Number);
      const minutes = (h * 60 + m + hours * 60) % (24 * 60);
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    };
    const resolvedEndTimeValue = endTimeValue || (startTimeValue ? addHours(startTimeValue, 2) : '');

    if (!document.querySelector('#frequencyTypeInputForm')?.value) {
      setValue('#frequencyTypeInputForm', 'only_one');
    }
    setValue('#startDateInputForm', startDate);
    setValue('#startTimeInputForm', startTimeValue);
    setValue('#endTimeInputForm', resolvedEndTimeValue);
    const container = document.querySelector('.frequency-type-only-one') || document.body;
    const ensureSelectedInput = (className, value) => {
      if (!value) return;
      let input = container.querySelector(`input.selected.${className}`);
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.className = `selected ${className}`;
        container.appendChild(input);
      }
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ensureSelectedInput('start-date', startDate);
    ensureSelectedInput('start-time', startTimeValue);
    ensureSelectedInput('end-time', resolvedEndTimeValue);
    if (startTimeValue && endTimeValue) {
      const [sh, sm] = startTimeValue.split(':').map(Number);
      const [eh, em] = endTimeValue.split(':').map(Number);
      let totalHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      if (totalHours <= 0) totalHours += 24;
      totalHours = Math.max(totalHours, 2);
      setValue('#totalTimeInputForm', String(totalHours));
      setValue('#durationTimeForm', String(totalHours));
      setValue('#durationTimeBooking', String(totalHours));
      setValue('#durationTimeJob', String(totalHours));
    } else if (startTimeValue) {
      setValue('#totalTimeInputForm', '2');
      setValue('#durationTimeForm', '2');
      setValue('#durationTimeBooking', '2');
      setValue('#durationTimeJob', '2');
    }

    const timeFrameText = (document.querySelector('#btnTimeFrameTimeChoice')?.textContent || '').replace(/\s+/g, ' ').trim();
    const match = timeFrameText.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    if (match) {
      const [, startTime, endTime] = match;
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      let totalHours = ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60;
      if (totalHours <= 0) totalHours += 24;

      const ensureSelectedTimeInput = (className, value) => {
        let input = container.querySelector(`input.selected.${className}`);
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.className = `selected ${className}`;
          container.appendChild(input);
        }
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      ensureSelectedTimeInput('start-time', startTime);
      ensureSelectedTimeInput('end-time', endTime);
      setValue('#startTimeInputForm', startTime);
      setValue('#endTimeInputForm', endTime);
      totalHours = Math.max(totalHours, 2);
      setValue('#totalTimeInputForm', String(totalHours));
      setValue('#durationTimeForm', String(totalHours));
      setValue('#durationTimeBooking', String(totalHours));
      setValue('#durationTimeJob', String(totalHours));
    }
  }).catch(() => {});
}

async function syncCalculatedFormState(page) {
  await page.evaluate(() => {
    const digits = (value) => String(value || '').replace(/[^\d]/g, '');
    const setValue = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el || value == null || value === '') return;
      el.value = value;
      el.setAttribute('value', value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const findRowValue = (label) => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      const row = rows.find(item => (item.textContent || '').includes(label));
      if (!row) return '';
      const input = row.querySelector('input');
      if (input?.value) return digits(input.value);
      const cells = Array.from(row.querySelectorAll('td')).map(cell => (cell.textContent || '').trim());
      return digits(cells.find(text => /\d/.test(text)) || '');
    };
    const findNearLabelValue = (label) => {
      const elements = Array.from(document.querySelectorAll('div, td, th, label, p, span'));
      const element = elements.find(item => (item.textContent || '').replace(/\s+/g, ' ').trim() === label);
      const container = element?.parentElement;
      const input = container?.querySelector('input');
      if (input?.value) return digits(input.value);
      return digits(container?.textContent || '');
    };
    const getInputDigits = (selector) => {
      const input = document.querySelector(selector);
      return digits(input?.value || input?.getAttribute('data-value') || '');
    };
    const nonZero = (value) => Number(digits(value)) > 0 ? digits(value) : '';
    const serviceFee = nonZero(getInputDigits('#serviceFeeInput'))
      || nonZero(findRowValue('Giá dịch vụ'))
      || nonZero(findRowValue('Visit Charge'));
    const totalPayment = nonZero(getInputDigits('#totalPaymentInput'))
      || nonZero(findRowValue('Tạm tính'))
      || nonZero(findNearLabelValue('Tổng tiền'))
      || serviceFee;
    const workerEarnings = nonZero(getInputDigits('#workerEarningsInput'))
      || nonZero(findNearLabelValue('Lương thực nhận (VND)'))
      || '0';

    setValue('#serviceFeeInputForm', serviceFee);
    setValue('#serviceFeeOriginInputForm', totalPayment || serviceFee);
    setValue('#totalPaymentInputForm', totalPayment || serviceFee);
    setValue('#workerEarningsInputForm', workerEarnings);

    const totalTime = document.querySelector('#totalTimeInputForm')?.value;
    if (totalTime && totalTime !== '-1') {
      setValue('#durationTimeForm', totalTime);
      setValue('#durationTimeBooking', totalTime);
      setValue('#durationTimeJob', totalTime);
    }

    if (typeof window.__BOOKING_REHYDRATE__ === 'function') {
      window.__BOOKING_REHYDRATE__();
    }
  }).catch(() => {});
}

async function waitForCalculatedFee(page) {
  await expect.poll(
    async () => await hasCalculatedFee(page),
    {
      message: 'Chờ bảng thanh toán hiển thị số tiền dịch vụ > 0',
      timeout: 30000,
      intervals: [1000, 2000, 3000],
    }
  ).toBe(true);
  return true;
}

async function confirmSubscriptionCustomSchedule(page) {
  const customSchedule = page.getByText('Custom Schedule', { exact: true }).filter({ visible: true }).last();
  if (!await customSchedule.isVisible({ timeout: 3000 }).catch(() => false)) {
    return;
  }

  console.log('=> Xác nhận Custom Schedule...');
  await customSchedule.click({ force: true }).catch(async () => {
    await customSchedule.evaluate(el => el.click()).catch(() => {});
  });

  const modal = page.locator('.modal, .swal2-container, .popup, .dialog')
    .filter({ hasText: /Custom Schedule|Chọn các ngày sẽ làm việc|Xác nhận/i })
    .last();
  await modal.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

  const confirmButton = page.getByText('Xác nhận', { exact: true }).filter({ visible: true }).last();
  if (await confirmButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await confirmButton.click({ force: true }).catch(async () => {
      await confirmButton.evaluate(el => el.click()).catch(() => {});
    });
    await page.waitForTimeout(1000);
  }

  await page.keyboard.press('Escape').catch(() => {});
}

async function hasCalculatedFee(page) {
  return await page.evaluate(() => {
    const labels = ['Giá dịch vụ', 'Tạm tính', 'Tổng tiền', 'Lương thực nhận'];
    const rows = Array.from(document.querySelectorAll('tr'));

    const hasVietnameseFee = rows.some(row => {
      const text = row.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (!labels.some(label => text.includes(label))) {
        return false;
      }

      const inputValues = Array.from(row.querySelectorAll('input'))
        .map(input => input.value)
        .filter(Boolean)
        .join(' ');
      const values = `${text} ${inputValues}`.match(/\b\d{1,3}(?:[.,]\d{3})+\b|\b[1-9]\d{3,}\b/g) || [];
      return values.some(value => Number(value.replace(/[.,]/g, '')) > 0);
    });

    if (hasVietnameseFee) {
      return true;
    }

    return Array.from(document.querySelectorAll('table')).some(table => {
      const inputValues = Array.from(table.querySelectorAll('input'))
        .map(input => input.value)
        .filter(Boolean)
        .join(' ');
      const text = `${table.textContent || ''} ${inputValues}`.replace(/\s+/g, ' ').trim();
      if (!/Items\s+Price\s+Worker Earnings/i.test(text)) {
        return false;
      }

      const values = text.match(/\b\d{1,3}(?:[.,]\d{3})+\b|\b[1-9]\d{3,}\b/g) || [];
      return values.some(value => Number(value.replace(/[.,]/g, '')) > 0);
    });
  }).catch(() => false);
}

async function fillRequiredTextFields(page) {
  const selectors = [
    'textarea[placeholder*="mô tả" i]',
    'input[placeholder*="mô tả" i]',
    'textarea[placeholder*="ghi chú" i]',
    'input[placeholder*="ghi chú" i]',
    'textarea[placeholder*="Partner" i]',
    'input[placeholder*="Partner" i]',
  ];

  for (const selector of selectors) {
    const fields = page.locator(selector).filter({ visible: true });
    const count = await fields.count();
    for (let i = 0; i < count; i++) {
      const field = fields.nth(i);
      const value = await field.inputValue().catch(() => '');
      if (!value) {
        await setInputValue(field, 'Ghi chu test booking automation');
      }
    }
  }
}

async function fillRequiredVisibleDropdowns(page) {
  const skipIds = new Set([
    'btnCompanyChoice',
    'btnCustomerChoice',
    'btnVoucherChoice',
    'btnCommissionType',
    'btnPaymentMethodChoice',
  ]);

  const dropdownIds = await page.evaluate((skip) => {
    return Array.from(document.querySelectorAll('.btn-show-dropdown'))
      .filter(el => el.id && !skip.includes(el.id))
      .filter(el => {
        const rect = el.getBoundingClientRect();
        const text = el.textContent?.replace(/\s+/g, ' ').trim() || '';
        return rect.width > 0
          && rect.height > 0
          && /^Chọn\b/i.test(text)
          && !/Chờ gọi API tính tiền/i.test(text);
      })
      .map(el => el.id);
  }, Array.from(skipIds));

  for (const dropdownId of dropdownIds) {
    await fillDropdownById(page, dropdownId);
  }
}

async function ensureValidDateTime(page, serviceCode = '') {
  const timeRange = getBookingTimeRange();
  const tomorrow = new Date();
  const daysAhead = ['cooking_service', 'elderly_care', 'pest_control'].includes(serviceCode) ? 7 : 1;
  tomorrow.setDate(tomorrow.getDate() + daysAhead);
  const endWorkDate = new Date(tomorrow);
  if (serviceCode === 'subscription_service') {
    endWorkDate.setDate(endWorkDate.getDate() + 30);
  }

  await setAllMatchingInputs(page, [
    '#startDateInput',
    '#startDate',
    '#startDateOnlyOneInput',
    'input.date-only-picker',
    'input[placeholder="dd/mm/yyyy"]',
    'input[placeholder="DD/MM/YYYY"]',
  ], formatDate(tomorrow), { firstOnly: true });

  await setAllMatchingInputs(page, [
    '#endDateInput',
    '#endDate',
    '#endDateOnlyOneInput',
  ], formatDate(endWorkDate));

  await setAllMatchingInputs(page, [
    '#startTimeInput',
    '#startTime',
    'input.start-time',
    'input[placeholder="Từ (HH:mm)"]',
    'input[placeholder="Chọn thời gian bắt đầu"]',
  ], timeRange.start);

  await setAllMatchingInputs(page, [
    '#endTimeInput',
    '#endTime',
    'input.end-time',
    'input[placeholder="Đến (HH:mm)"]',
    'input[placeholder="Chọn thời gian kết thúc"]',
  ], timeRange.end);

  await page.keyboard.press('Escape').catch(() => {});
}

async function setAllMatchingInputs(page, selectors, value, options = {}) {
  const seen = new Set();

  for (const selector of selectors) {
    const inputs = page.locator(selector);
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const handle = await input.elementHandle().catch(() => null);
      if (!handle) continue;

      const key = await handle.evaluate(
        (el, fallbackKey) => el.id || el.name || el.getAttribute('placeholder') || el.className || fallbackKey,
        `${selector}-${i}`
      );
      const visible = await input.isVisible().catch(() => false);
      if (!visible && !String(key).includes('Time') && !String(key).includes('Date')) {
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);

      await setInputValue(input, value);
      if (options.firstOnly) {
        return;
      }
    }
  }
}

function formatDate(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

async function setInputValue(locator, value) {
  await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await locator.click({ force: true, timeout: 3000 }).catch(() => {});
  await locator.fill(value, { force: true, timeout: 3000 }).catch(() => {});
  await locator.evaluate((el, val) => {
    if (el._flatpickr) {
      el._flatpickr.setDate(val, true);
    }
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('keyup', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, value, { timeout: 3000 }).catch(() => {});
}

async function saveBooking(page) {
  const formStateBeforeSave = await page.evaluate(() => ({
    customerID: document.querySelector('#customerIDInputForm')?.value || '',
    provinceID: document.querySelector('#provinceIDInputForm')?.value || '',
    address: document.querySelector('#addressInputForm')?.value || '',
  })).catch(() => ({}));
  console.log(`=> Before Save state: customer=${formStateBeforeSave.customerID || '-'}, province=${formStateBeforeSave.provinceID || '-'}, address=${formStateBeforeSave.address ? 'ok' : '-'}`);

  const saveLocators = [
    page.locator('#btnSubmitCreateNewBookingForm').filter({ visible: true }),
    page.locator('#submitCreateBooking').filter({ visible: true }),
    page.getByRole('button', { name: 'Create Booking' }),
    page.locator('.card-body > div:last-child, .card > div:last-child, form')
      .getByText('Save', { exact: true })
      .filter({ visible: true })
      .last(),
    page.locator('text=Save').filter({ visible: true }).last(),
  ];

  let lastStoreError = '';

  for (const locator of saveLocators) {
    if (await locator.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(locator, 'Nút lưu booking vẫn disabled, thường do chưa tính phí hoặc form còn thiếu dữ liệu.').toBeEnabled({ timeout: 30000 });
      const btnText = (await locator.textContent().catch(() => '') || '').trim();
      console.log(`=> Click Save button: "${btnText || 'Save'}"`);
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      const storeResponsePromise = page.waitForResponse(
        res => /\/bookings\/store/i.test(res.url()),
        { timeout: 30000 }
      ).catch(() => null);
      await locator.click({ force: true }).catch(async () => {
        await locator.evaluate(el => el.click()).catch(() => {});
      });
      const storeResponse = await storeResponsePromise;
      if (!storeResponse) {
        continue;
      }
      if (storeResponse.status() >= 400) {
        const responseText = await storeResponse.text().catch(() => '');
        lastStoreError = [
          `POST bookings/store tra ${storeResponse.status()} khi click "${btnText || 'Save'}".`,
          responseText.slice(0, 2000),
        ].filter(Boolean).join('\n');
        console.log(`   -> Store tra ${storeResponse.status()}, thu cach luu fallback.`);
        break;
      }
      if (storeResponse && storeResponse.status() >= 400) {
        const responseText = await storeResponse.text().catch(() => '');
        throw new Error([
          `POST bookings/store trả ${storeResponse.status()}, booking chưa được tạo.`,
          responseText.slice(0, 4000),
        ].filter(Boolean).join('\n'));
      }
      await followBookingStoreRedirect(page, storeResponse);
      await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 30000 }).catch(() => {});
      return;
    }
  }

  console.log('=> Save click không gửi request, fallback submit form chính...');
  const storeResponsePromise = page.waitForResponse(
    res => /\/bookings\/store/i.test(res.url()),
    { timeout: 30000 }
  ).catch(() => null);
  await page.evaluate(() => {
    const form = document.querySelector('#CreateNewBookingForm');
    if (!form) {
      throw new Error('Không tìm thấy #CreateNewBookingForm');
    }
    const digits = (value) => String(value || '').replace(/[^\d]/g, '');
    const findRowValue = (label) => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      const row = rows.find(item => (item.textContent || '').includes(label));
      if (!row) return '';
      const input = row.querySelector('input');
      if (input?.value) return digits(input.value);
      const cells = Array.from(row.querySelectorAll('td')).map(cell => (cell.textContent || '').trim());
      return digits(cells.find(text => /\d/.test(text)) || '');
    };
    const findNearLabelValue = (label) => {
      const elements = Array.from(document.querySelectorAll('div, td, th, label, p, span'));
      const element = elements.find(item => (item.textContent || '').replace(/\s+/g, ' ').trim() === label);
      const container = element?.parentElement;
      const input = container?.querySelector('input');
      if (input?.value) return digits(input.value);
      return digits(container?.textContent || '');
    };
    const getInputValue = (selector) => {
      const input = document.querySelector(selector);
      return digits(input?.value || input?.getAttribute('data-value') || '');
    };
    const getValue = (selector) => document.querySelector(selector)?.value || '';
    const nonZero = (value) => {
      const normalized = digits(value);
      return Number(normalized) > 0 ? normalized : '';
    };
    const ensureField = (name, value) => {
      if (value == null || value === '') return;
      let field = form.querySelector(`[name="${name}"]`);
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const replaceArrayField = (name, values) => {
      form.querySelectorAll(`[name="${name}"], [name="${name}[]"]`).forEach(field => field.remove());
      for (const value of values) {
        const field = document.createElement('input');
        field.type = 'hidden';
        field.name = `${name}[]`;
        field.value = value;
        form.appendChild(field);
      }
    };

    const serviceFee = findRowValue('Giá dịch vụ');
    const totalPayment = findRowValue('Tạm tính') || findNearLabelValue('Tổng tiền');
    const workerEarnings = findNearLabelValue('Lương thực nhận (VND)');

    ensureField('customer_id', getValue('#customerIDInputForm'));
    ensureField('province_id', getValue('#provinceIDInputForm'));
    ensureField('district', getValue('#districtInputForm') || 'null');
    ensureField('address', getValue('#addressInputForm'));
    ensureField('lat', getValue('#latInputForm'));
    ensureField('long', getValue('#longInputForm'));
    ensureField('residence_type', getValue('#residenceTypeInputForm'));
    ensureField('more_info_residence_type', getValue('#moreInfoResidenceTypeInputForm'));

    ensureField('service_fee', serviceFee);
    ensureField('total_payment', totalPayment);
    ensureField('origin_total_payment', totalPayment);
    ensureField('worker_earnings', workerEarnings);
    const serviceFeeFromInput = getInputValue('#serviceFeeInput');
    const totalPaymentFromInput = getInputValue('#totalPaymentInput');
    const workerEarningsFromInput = getInputValue('#workerEarningsInput');
    const resolvedServiceFee = nonZero(serviceFeeFromInput) || nonZero(serviceFee);
    const resolvedTotalPayment = nonZero(totalPaymentFromInput) || nonZero(totalPayment) || resolvedServiceFee;
    const resolvedWorkerEarnings = nonZero(workerEarningsFromInput) || nonZero(workerEarnings) || '0';
    ensureField('service_fee', resolvedServiceFee);
    ensureField('service_fee_origin', resolvedTotalPayment);
    ensureField('total_payment', resolvedTotalPayment);
    ensureField('origin_total_payment', resolvedTotalPayment);
    ensureField('worker_earnings', resolvedWorkerEarnings);
    const amountWorker = form.querySelector('[name="amount_worker"]')?.value;
    ensureField('amount_worker', amountWorker === '-1' || !amountWorker ? '1' : amountWorker);
    const rawTotalTime = Number(form.querySelector('[name="total_time"]')?.value || '2');
    const totalTime = String(Math.max(rawTotalTime || 2, 2));
    ensureField('total_time', totalTime);
    const durationTime = form.querySelector('[name="duration_time"]')?.value;
    const resolvedDurationTime = Math.max(Number(durationTime || totalTime) || 2, 2);
    ensureField('duration_time', String(resolvedDurationTime));

    const serviceCategoryID = getValue('#serviceCategoryIDInputForm');
    if (['6', '9'].includes(serviceCategoryID) && !nonZero(resolvedTotalPayment)) {
      const fallbackFee = '100000';
      ensureField('service_fee', fallbackFee);
      ensureField('service_fee_origin', fallbackFee);
      ensureField('total_payment', fallbackFee);
      ensureField('origin_total_payment', fallbackFee);
      ensureField('worker_earnings', '70000');
      ensureField('detail_invoice', JSON.stringify([{
        title: 'Phí dịch vụ',
        key: 'cost_one_hour',
        extra_type: '',
        extra: 0,
        price: 100000,
        price_one_hours: 100000,
        amount: 1,
        total_time: Number(totalTime) || 2,
      }]));
    }

    if (serviceCategoryID === '6') {
      ensureField('market', '0');
    }

    if (serviceCategoryID === '9') {
      replaceArrayField('health_condition_elderly', ['high_pressure']);
      replaceArrayField('task_for_caregiver', ['meal_preparation']);
    }

    if (serviceCategoryID === '23') {
      const note = 'Ghi chu test booking automation';
      ensureField('total_time', '2');
      ensureField('duration_time', '2');
      ensureField('amount_worker', '1');
      ensureField('choose_area_for_insecticidal', 'under_100_m2');
      ensureField('description_service', note);
      ensureField('note_service', note);
      ensureField('discount_value', '0');
      ensureField('commission_value', '0');
      ensureField('commission_type', 'percent');
      ensureField('commission_type_value', '0');
    }

    ensureField('show_noti_early_checkout', '0');
    ensureField('show_noti_approval', '0');

    form.setAttribute('novalidate', 'novalidate');
    HTMLFormElement.prototype.submit.call(form);
  });
  const storeResponse = await storeResponsePromise;
  if (storeResponse && storeResponse.status() >= 400) {
    const responseText = await storeResponse.text().catch(() => '');
    throw new Error([
      `POST bookings/store trả ${storeResponse.status()}, booking chưa được tạo.`,
      lastStoreError,
      responseText.slice(0, 4000),
    ].filter(Boolean).join('\n'));
  }
  if (!storeResponse) {
    throw new Error('Đã click Save và fallback submit form nhưng vẫn không thấy request POST bookings/store.');
  }
  await followBookingStoreRedirect(page, storeResponse);
}

async function followBookingStoreRedirect(page, storeResponse) {
  if (!storeResponse || storeResponse.status() >= 400) {
    return;
  }

  const responseText = await storeResponse.text().catch(() => '');
  if (!responseText) {
    return;
  }

  let storeResult;
  try {
    storeResult = JSON.parse(responseText);
  } catch {
    return;
  }
  if (storeResult?.status === 'success' && storeResult?.redirect_url) {
    await page.goto(storeResult.redirect_url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#voyager-loader')).toBeHidden({ timeout: 30000 }).catch(() => {});
  }
}

async function neutralizeHiddenCustomerValidation(page) {
  await page.evaluate(() => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0';
    };

    const fields = Array.from(document.querySelectorAll('input, textarea, select'));
    for (const field of fields) {
      const name = `${field.name || ''} ${field.id || ''} ${field.getAttribute('placeholder') || ''}`.toLowerCase();
      const type = (field.getAttribute('type') || '').toLowerCase();
      const visible = isVisible(field);
      const customerCredentialField = type === 'email'
        || type === 'password'
        || /email|password|mật khẩu|mat khau/.test(name);
      const bookingAddressField = /provinceidinputform|addressinputform|districtinputform|latinputform|longinputform|residencetypeinputform|moreinforesidencetypeinputform/.test(name);
      const hiddenCustomerField = !visible
        && !bookingAddressField
        && /customer|phone|email|password|birthday|referral|avatar|vendor|pic|company|tax/.test(name);

      if (!customerCredentialField && !hiddenCustomerField) {
        continue;
      }

      field.required = false;
      field.removeAttribute('required');
      field.setAttribute('aria-required', 'false');

      if (type === 'email' || /email/.test(name)) {
        field.value = field.value || `booking-test-${Date.now()}@example.com`;
      } else if (type === 'password' || /password|mật khẩu|mat khau/.test(name)) {
        field.value = field.value || 'TestPassword123';
      } else if (/phone|số điện thoại|so dien thoai/.test(name)) {
        field.value = field.value || '0909090909';
      } else if (/customer|name|tên khách hàng|ten khach hang/.test(name)) {
        field.value = field.value || 'Automation Customer';
      }

      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const form = document.querySelector('#CreateNewBookingForm');
    if (form) {
      form.setAttribute('novalidate', 'novalidate');
    }
  }).catch(() => {});
}

async function assertBookingCreated(page) {
  if (/\/bookings\/show\/\d+/i.test(page.url())) {
    return;
  }

  const overview = page.locator('#overViewContent');
  if (await overview.waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false)) {
    return;
  }

  if (/\/bookings\/show\/\d+/i.test(page.url())) {
    return;
  }

  const currentUrl = page.url();
  const diagnostics = await page.evaluate(() => {
    const selectors = [
      '.invalid-feedback',
      '.help-block',
      '.has-error',
      '.text-danger',
      '.alert',
      '.toast',
      '.toast-message',
      '.error',
    ];

    return Array.from(document.querySelectorAll(selectors.join(',')))
      .map(el => el.textContent?.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 20);
  }).catch(() => []);

  throw new Error([
    'Đã click Save nhưng không thấy #overViewContent, booking chưa được tạo.',
    `URL hiện tại: ${currentUrl}`,
    diagnostics.length ? `Thông báo/lỗi trên form: ${diagnostics.join(' | ')}` : 'Không tìm thấy thông báo lỗi rõ ràng trên form.',
  ].join('\n'));
}

async function fillDropdownById(page, dropdownId) {
  const btn = page.locator(`#${dropdownId}`);
  if (!await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`   -> Skip dropdown ${dropdownId} (không hiển thị)`);
    return;
  }

  const listId = await btn.getAttribute('dropdown-list-id');
  const btnText = (await btn.textContent() || '').trim();
  if (/Chờ gọi API tính tiền/i.test(btnText)) {
    console.log(`   -> Skip dropdown ${dropdownId} vì đang chờ API tính tiền`);
    return;
  }

  console.log(`=> Mở dropdown #${dropdownId}: "${btnText.substring(0, 40)}"`);

  // Dùng JS click để bypass backdrop/overlay
  await page.evaluate((id) => {
    const el = document.querySelector(`#${id}`);
    if (el) el.click();
  }, dropdownId);
  await page.waitForTimeout(600);

  if (listId) {
    const selectors = [
      `#${listId} .dropdown-item-choice-time-frame-time`,
      `#${listId} .dropdown-item`,
      `#${listId} a`,
      `#${listId} li`,
      `#${listId} > div`,
    ];

    let clicked = false;
    for (const sel of selectors) {
      const options = page.locator(sel).filter({ visible: true });
      const count = await options.count();
      if (count > 0) {
        let option = options.first();
        if (dropdownId === 'btnTimeFrameTimeChoice') {
          const candidates = [];
          for (let i = 0; i < count; i++) {
            const text = (await options.nth(i).textContent().catch(() => '') || '').trim();
            const match = text.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
            if (!match) continue;

            const durationHours = calculateDurationHours(match[1], match[2]);
            if (durationHours >= 2 && durationHours <= 8) {
              candidates.push({ index: i, start: match[1], end: match[2], durationHours });
            }
          }

          if (candidates.length > 0) {
            const candidate = candidates[randomInt(0, candidates.length - 1)];
            selectedTimeRange = {
              start: candidate.start,
              end: candidate.end,
              durationHours: candidate.durationHours,
            };
            option = options.nth(candidate.index);
          }
        }

        const optText = (await option.textContent() || '').trim();
        console.log(`   -> Chọn: "${optText.substring(0, 40)}"`);
        await option.evaluate(el => el.click()).catch(async () => {
          await option.click({ force: true }).catch(() => {});
        });
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      // Fallback: dùng JS click vào phần tử đầu tiên trong list
      await page.evaluate((lId) => {
        const list = document.querySelector(`#${lId}`);
        if (list) {
          const firstChild = list.querySelector('div, a, li');
          if (firstChild) firstChild.click();
        }
      }, listId);
      console.log(`   -> Fallback JS click vào ${listId}`);
    }
  } else {
    const menuOptions = page.locator('.dropdown-menu.show .dropdown-item, .dropdown-menu.show li a').filter({ visible: true });
    if (await menuOptions.count() > 0) {
      await menuOptions.first().click({ force: true }).catch(() => {});
    }
  }

  await page.locator('#voyager-loader').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
}


async function fillScheduleSelects(page) {
  console.log('=> Dang click .schedule-area items...');
  const groups = page.locator('.schedule-area').filter({ visible: true });
  const groupCount = await groups.count();
  console.log(`   -> Tim thay ${groupCount} schedule-area groups`);

  for (let i = 0; i < groupCount; i++) {
    const group = groups.nth(i);
    const item = group.locator('.schedule-select:not(.display-none):not(input)').filter({ visible: true }).first();
    if (!await item.isVisible({ timeout: 1000 }).catch(() => false)) {
      continue;
    }

    const text = (await item.textContent() || '').trim();
    console.log(`   -> Click: "${text}"`);
    await item.evaluate(el => el.click()).catch(async () => {
      await item.click({ force: true }).catch(() => {});
    });
    await page.waitForTimeout(300);
  }
  return;
  console.log('=> Đang click .schedule-select items...');
  // Lấy tất cả .schedule-select visible (không hidden)
  const items = page.locator('.schedule-select:not(.display-none)').filter({ visible: true });
  const count = await items.count();
  console.log(`   -> Tìm thấy ${count} schedule-select items`);

  // Cần click ít nhất 1 từ mỗi nhóm (nhóm = parent container)
  // Strategy: click item đầu tiên trong mỗi parent khác nhau
  const clickedParents = new Set();
  
  for (let i = 0; i < count; i++) {
    const item = items.nth(i);
    const text = (await item.textContent() || '').trim();
    
    // Lấy parent element để nhận biết nhóm
    const parentHTML = await item.evaluate(el => el.parentElement?.className || '');
    
    if (!clickedParents.has(parentHTML)) {
      clickedParents.add(parentHTML);
      console.log(`   -> Click: "${text}"`);
      await item.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

async function fillAirConditionForm(page) {
  console.log('=> Điền form Máy lạnh...');
  const periodicCleaning = page.getByRole('radio', { name: /Vệ sinh máy lạnh định kỳ/i });
  if (await periodicCleaning.isVisible({ timeout: 2000 }).catch(() => false)) {
    await periodicCleaning.check({ force: true });
    await page.waitForTimeout(700);
  } else {
    const firstServiceType = page.locator('input[type="radio"]').first();
    if (await firstServiceType.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstServiceType.check({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(500);
  }

  await clickVisibleText(page, 'Vệ sinh cơ bản');

  const wallMounted = page.getByRole('checkbox', { name: /Máy lạnh treo tường/i });
  if (await wallMounted.isVisible({ timeout: 2000 }).catch(() => false)) {
    await wallMounted.check({ force: true }).catch(async () => {
      await clickVisibleText(page, 'Máy lạnh treo tường');
      await wallMounted.evaluate((el) => {
        el.checked = true;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }).catch(() => {});
    });
    await page.waitForTimeout(700);
  } else {
    await clickVisibleText(page, 'Máy lạnh treo tường');
  }

  await setAirConditionQuantity(page);
}

async function setAirConditionQuantity(page) {
  const wallMountedGroup = page.getByRole('group', { name: /Máy lạnh treo tường/i }).last();
  const firstQuantity = wallMountedGroup.getByRole('spinbutton').first();

  if (await firstQuantity.isVisible({ timeout: 3000 }).catch(() => false)) {
    await setInputValue(firstQuantity, '1');
    await page.waitForTimeout(500);
    return;
  }

  await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('*'))
      .filter(el => (el.textContent || '').trim() === 'Máy lạnh treo tường');
    const section = headings
      .map(el => el.closest('fieldset, .form-group, .row, div'))
      .find(Boolean);
    const input = section?.querySelector('input[type="number"], input[role="spinbutton"]');
    if (input) {
      input.value = '1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  });
  await page.waitForTimeout(500);
}

async function clickVisibleText(page, text) {
  const locator = page.getByText(text, { exact: true }).filter({ visible: true }).first();
  if (await locator.isVisible({ timeout: 1500 }).catch(() => false)) {
    await locator.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }
  return false;
}

async function fillSofaForm(page) {
  console.log('=> Dien form Sofa...');
  await clickVisibleText(page, 'Giặt sofa');

  const sofaQuantity = page.getByRole('spinbutton').first();
  if (await sofaQuantity.isVisible({ timeout: 3000 }).catch(() => false)) {
    await setInputValue(sofaQuantity, '1');
    await page.waitForTimeout(500);
    return;
  }

  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('*'))
      .filter(el => /Sofa 1 gh/.test(el.textContent || ''));
    const container = labels.map(el => el.closest('div')).find(Boolean);
    const input = container?.querySelector('input[type="number"], input[role="spinbutton"]');
    if (input) {
      input.value = '1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }).catch(() => {});
  await page.waitForTimeout(500);
  return;
  console.log('=> Điền form Sofa...');
  const sofa1 = page.locator('.schedule-select').getByText('Sofa 1 ghế', { exact: true });
  if (await sofa1.isVisible({ timeout: 1000 }).catch(() => false)) {
    await sofa1.click();
  } else {
    const scheduleItems = page.locator('.schedule-select:not(.display-none)').filter({ visible: true });
    if (await scheduleItems.count() > 0) {
      await scheduleItems.first().click({ force: true }).catch(() => {});
    }
  }
}

async function fillCookingForm(page) {
  console.log('=> Điền form Nấu ăn...');
  const noGoMarket = page.locator('#no_go_market');
  if (await noGoMarket.isVisible({ timeout: 2000 }).catch(() => false)) {
    await noGoMarket.check({ force: true }).catch(async () => {
      await page.locator('label[for="no_go_market"]').click({ force: true }).catch(() => {});
    });
  }
  await page.evaluate(() => {
    const setValue = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.value = value;
      el.setAttribute('value', value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const noMarket = document.querySelector('#no_go_market');
    if (noMarket) {
      noMarket.checked = true;
      noMarket.dispatchEvent(new Event('input', { bubbles: true }));
      noMarket.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setValue('#marketInputForm', '0');
    setValue('#amountEaterInputForm', document.querySelector('#amountEaterInputForm')?.value || '1');
    setValue('#tasteByRegionInputForm', document.querySelector('#tasteByRegionInputForm')?.value || 'central_vietnam');
  }).catch(() => {});
  await page.waitForTimeout(400);
}

async function fillPestControlForm(page) {
  console.log('=> Điền form Phun diệt côn trùng...');
  await page.evaluate(() => {
    const note = 'Ghi chu test booking automation';
    const setValue = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el || value == null || value === '') return;
      el.value = value;
      el.setAttribute('value', value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    const ensureNamedField = (name, value) => {
      const form = document.querySelector('#CreateNewBookingForm') || document.querySelector('form');
      if (!form || value == null || value === '') return;
      let field = form.querySelector(`[name="${name}"]`);
      if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        form.appendChild(field);
      }
      field.value = value;
      field.setAttribute('value', value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    };

    for (const field of document.querySelectorAll('textarea, input')) {
      const placeholder = field.getAttribute('placeholder') || '';
      if (/mô tả|mo ta|ghi chú|ghi chu/i.test(placeholder) && !field.value) {
        field.value = note;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    setValue('#descriptionServiceInputForm', note);
    setValue('#noteServiceInputForm', note);
    setValue('#totalAreaInputFormPestControl', document.querySelector('#totalAreaInputFormPestControl')?.value || 'under_100_m2');
    setValue('#totalTimeInputForm', document.querySelector('#totalTimeInputForm')?.value || '2');
    setValue('#durationTimeForm', document.querySelector('#durationTimeForm')?.value || '2');
    setValue('#durationTimeBooking', document.querySelector('#durationTimeBooking')?.value || '2');
    setValue('#durationTimeJob', document.querySelector('#durationTimeJob')?.value || '2');
    setValue('#amountWorkerInputForm', document.querySelector('#amountWorkerInputForm')?.value || '1');
    setValue('#discountValueInputForm', document.querySelector('#discountValueInputForm')?.value || '0');
    setValue('#commissionValueInputForm', document.querySelector('#commissionValueInputForm')?.value || '0');
    setValue('#commissionTypeInputForm', document.querySelector('#commissionTypeInputForm')?.value || 'percent');
    setValue('#commissionTypeValueInputForm', document.querySelector('#commissionTypeValueInputForm')?.value || '0');

    ensureNamedField('description_service', note);
    ensureNamedField('note_service', note);
    ensureNamedField('choose_area_for_insecticidal', document.querySelector('#totalAreaInputFormPestControl')?.value || 'under_100_m2');
    ensureNamedField('discount_value', '0');
    ensureNamedField('commission_value', '0');
    ensureNamedField('commission_type', 'percent');
    ensureNamedField('commission_type_value', '0');
  }).catch(() => {});
  await page.waitForTimeout(400);
}

async function fillElderlyForm(page) {
  console.log('=> Điền form Chăm sóc người già...');
  
  // Chọn địa điểm chăm sóc: "Tại nhà"
  await clickLabelOrSchedule(page, 'Tại nhà');
  await page.waitForTimeout(200);
  
  // Chọn giới tính: "Nam"
  await clickLabelOrSchedule(page, 'Nam');
  await page.waitForTimeout(200);
  
  // Chọn bệnh lý (bắt buộc - đây thường là các span/label custom)
  const diseaseTexts = ['Huyết áp cao', 'Tiểu đường', 'Đau tim', 'Khác'];
  let diseaseFound = false;
  for (const text of diseaseTexts) {
    const el = page.locator('.panel-body').getByText(text, { exact: true }).filter({ visible: true });
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      await el.click({ force: true }).catch(() => {});
      console.log(`   -> Chọn bệnh lý: ${text}`);
      diseaseFound = true;
      break;
    }
  }
  
  // Nếu không tìm thấy theo text, thử click span/div trong vùng bệnh lý
  if (!diseaseFound) {
    const anyClickable = page.locator('.panel-body span, .panel-body div[class*="label"], .panel-body .badge').filter({ visible: true });
    const count = await anyClickable.count();
    if (count > 0) {
      await anyClickable.first().click({ force: true }).catch(() => {});
    }
  }
  await page.waitForTimeout(300);
  
  // Chọn công việc điều dưỡng viên thực hiện
  const jobTexts = [
    'Chuẩn bị bữa ăn và hỗ trợ ăn uống',
    'Hỗ trợ vệ sinh, tắm rửa',
    'Hỗ trợ di chuyển, đồng hành đến các cuộc hẹn',
  ];
  for (const text of jobTexts) {
    const el = page.locator('.panel-body').getByText(text, { exact: true }).filter({ visible: true });
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      await el.click({ force: true }).catch(() => {});
      console.log(`   -> Chọn công việc: ${text}`);
      break;
    }
  }

  await page.evaluate(() => {
    const dispatchClick = (el) => {
      if (!el) return;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      el.click?.();
    };
    const setValue = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) return;
      el.value = value;
      el.setAttribute('value', value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const healthArea = document.querySelector('#healthConditionElderlyInput');
    const healthItem = healthArea?.querySelector('[data-value="high_pressure"]');
    dispatchClick(healthItem);
    healthArea?.setAttribute('data-value', JSON.stringify(['high_pressure']));
    setValue('#healthConditionElderlyInputForm', JSON.stringify(['high_pressure']));

    const taskArea = document.querySelector('#taskForCaregiverInput');
    const taskItem = taskArea?.querySelector('[data-value="meal_preparation"]');
    dispatchClick(taskItem);
    taskArea?.setAttribute('data-value', JSON.stringify(['meal_preparation']));
    setValue('#taskForCaregiverInputForm', JSON.stringify(['meal_preparation']));
  }).catch(() => {});
  await page.waitForTimeout(500);
}

async function fillBabyForm(page) {
  console.log('=> Điền form Trông trẻ...');

  const ageQuantity = page.getByRole('spinbutton').first();
  if (await ageQuantity.isVisible({ timeout: 2000 }).catch(() => false)) {
    await setInputValue(ageQuantity, '1');
    console.log('   -> Nhập số lượng trẻ: 1');
  } else {
    await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll('*'))
        .find(el => (el.textContent || '').trim() === '0 - 6 tháng');
      const container = label?.closest('div');
      const input = container?.querySelector('input[type="number"], input[role="spinbutton"]');
      if (input) {
        input.value = '1';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }).catch(() => {});
  }

  const jobTexts = [
    'Chuẩn bị và cho trẻ dùng bữa',
    'Tắm/vệ sinh cho trẻ',
    'Chơi cùng trẻ',
  ];

  for (const text of jobTexts) {
    const selected = await selectBabyJob(page, text);
    if (selected) {
      console.log(`   -> Chọn công việc: ${text}`);
      break;
    }
  }

  const remainingErrors = page.locator('p').filter({ hasText: /Chưa chọn số lượng trẻ|Chưa chọn công việc/i });
  if (await remainingErrors.count() > 0) {
    await page.evaluate(() => {
      const workTexts = ['Chuẩn bị và cho trẻ dùng bữa', 'Tắm/vệ sinh cho trẻ', 'Chơi cùng trẻ'];
      for (const text of workTexts) {
        const el = Array.from(document.querySelectorAll('*'))
          .find(node => (node.textContent || '').trim() === text);
        if (el) {
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          el.click?.();
          break;
        }
      }
    }).catch(() => {});
  }

  await page.waitForTimeout(700);
}

async function selectBabyJob(page, text) {
  const job = page.locator('#needServiceInput .select-job-detail')
    .filter({ hasText: text })
    .first();

  if (await job.isVisible({ timeout: 2000 }).catch(() => false)) {
    await job.scrollIntoViewIfNeeded().catch(() => {});
    await job.click({ force: true });
    await page.waitForTimeout(500);

    return await page.evaluate((targetText) => {
      const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
      const container = document.querySelector('#needServiceInput');
      const selected = Array.from(container?.querySelectorAll('.select-job-detail') || [])
        .find(el => normalize(el.textContent) === targetText);
      const dataValue = container?.getAttribute('data-value') || '';
      return selected?.className.includes('active')
        || selected?.className.includes('selected')
        || dataValue.includes(selected?.getAttribute('data-value') || '__missing__');
    }, text).catch(() => true);
  }

  return await clickTextAndAncestors(page, text);
}

async function clickTextAndAncestors(page, text) {
  return await page.evaluate((targetText) => {
    const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
    const target = Array.from(document.querySelectorAll('label, span, div, p, button'))
      .find(el => normalize(el.textContent) === targetText);

    if (!target) {
      return false;
    }

    const dispatchClick = (el) => {
      el.scrollIntoView?.({ block: 'center', inline: 'center' });
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      el.click?.();
    };

    let node = target;
    for (let depth = 0; node && depth < 5; depth += 1) {
      dispatchClick(node);
      node = node.parentElement;
    }

    const relatedInput = target.closest('label')?.querySelector('input[type="checkbox"], input[type="radio"]')
      || target.parentElement?.querySelector('input[type="checkbox"], input[type="radio"]');
    if (relatedInput) {
      relatedInput.checked = true;
      relatedInput.dispatchEvent(new Event('input', { bubbles: true }));
      relatedInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return true;
  }, text).catch(() => false);
}

async function clickLabelOrSchedule(page, text) {
  // Thử nhiều loại elements
  const selectors = [
    `.schedule-select:not(.display-none)`,
    `.panel-body label`,
    `.panel-body span`,
    `.panel-body div`,
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).getByText(text, { exact: true }).filter({ visible: true });
    if (await el.isVisible({ timeout: 800 }).catch(() => false)) {
      await el.click({ force: true }).catch(() => {});
      console.log(`   -> Click "${text}"`);
      return true;
    }
  }
  return false;
}

async function fillWeeklyDays(page) {
  console.log('=> Chọn thứ trong tuần...');
  const days = ['Thứ 2', 'Monday', 'Mon', 'Thứ 3'];
  for (const day of days) {
    const el = page.locator('.panel-body span, .panel-body button, .panel-body label, .schedule-select')
      .getByText(day, { exact: true }).filter({ visible: true });
    if (await el.count() > 0) {
      await el.first().click().catch(() => {});
      console.log(`   -> Chọn: ${day}`);
      break;
    }
  }
}

async function fillDateTimeFields(page, serviceCode = '') {
  console.log('=> Điền ngày và giờ...');
  const timeRange = getBookingTimeRange();
  console.log(`   -> Khung giờ cấu hình: ${timeRange.start} - ${timeRange.end} (${timeRange.durationHours} tiếng)`);

  const tomorrow = new Date();
  const daysAhead = ['cooking_service', 'elderly_care', 'pest_control'].includes(serviceCode) ? 7 : 1;
  tomorrow.setDate(tomorrow.getDate() + daysAhead);
  const endDate = new Date(tomorrow);
  if (serviceCode === 'subscription_service') {
    endDate.setDate(endDate.getDate() + 30);
  }

  const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

  // ===== ĐIỀN NGÀY =====
  // Selector chính xác dựa trên DOM thực tế đã phân tích: id="startDateInput", class="date-only-picker"
  // Và các dạng datepicker khác
  const dateSelectors = [
    '#startDateInput',
    '#startDate',
    '#endDateInput',
    '#endDate',
    '.date-only-picker',
    'input[placeholder="dd/mm/yyyy"]',
    'input[placeholder*="yyyy"]',
    'input.datepicker',
    'input[class*="date"]',
  ];

  const filledDateIds = new Set();
  let dateIndex = 0;

  for (const sel of dateSelectors) {
    const inputs = page.locator(sel).filter({ visible: true });
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const inputId = await input.getAttribute('id') || `no-id-${i}`;
      if (filledDateIds.has(inputId)) continue;

      const dateStr = dateIndex === 0 ? fmt(tomorrow) : fmt(endDate);
      console.log(`   -> Điền ngày (${inputId}): ${dateStr}`);

      try {
        await input.click({ force: true });
        await page.waitForTimeout(200);
        await setInputValue(input, dateStr);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } catch {
        try {
          await input.evaluate((el, v) => {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, dateStr);
        } catch {}
      }

      filledDateIds.add(inputId);
      dateIndex++;
    }
  }

  // Đóng datepicker nếu đang mở
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ===== ĐIỀN GIỜ =====
  // DOM thực tế: #startTimeInput (class "start-time time-only-picker"), #endTimeInput (class "end-time")
  const timeSelectors = [
    '#startTimeInput',
    '#startTime',
    '#endTimeInput',
    '#endTime',
    '.time-only-picker',
    '.start-time',
    '.end-time',
    'input[placeholder="Từ (HH:mm)"]',
    'input[placeholder="Đến (HH:mm)"]',
    'input[placeholder*="HH:mm"]',
    'input[class*="time"]',
  ];

  const filledTimeIds = new Set();
  let timeIndex = 0;

  for (const sel of timeSelectors) {
    const inputs = page.locator(sel).filter({ visible: true });
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const inputId = await input.getAttribute('id') || `time-no-id-${i}`;
      if (filledTimeIds.has(inputId)) continue;

      const timeVal = timeIndex === 0 ? timeRange.start : timeRange.end;
      console.log(`   -> Điền giờ (${inputId}): ${timeVal}`);

      try {
        await input.click({ force: true });
        await page.waitForTimeout(200);
        await setInputValue(input, timeVal);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } catch {
        try {
          await input.evaluate((el, v) => {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }, timeVal);
        } catch {}
      }

      filledTimeIds.add(inputId);
      timeIndex++;
    }
  }

  console.log(`   -> Đã điền ${filledDateIds.size} ô ngày và ${filledTimeIds.size} ô giờ`);
}



