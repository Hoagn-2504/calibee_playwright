export const bookingServices = {
  basic_cleaning: {
    name: 'Don dep co ban',
    dropdownsToFill: ['btnTotalAreaChoice'],
    scheduleSelectGroups: 0,
  },
  subscription_service: {
    name: 'Don dep dinh ky',
    dropdownsToFill: ['btnTotalAreaChoice', 'btnPackageChoice'],
    needsWeekday: true,
    hasStartEndDate: true,
  },
  deep_cleaning: {
    name: 'Tong ve sinh',
    dropdownsToFill: ['btnTotalAreaChoice', 'choiceAmountPartner'],
  },
  air_condition: {
    name: 'Dich vu may lanh',
    dropdownsToFill: [],
    needsAirConType: true,
  },
  sofa_service: {
    name: 'Giat sofa, tham,...',
    dropdownsToFill: ['btnTimeFrameTimeChoice'],
    needsSofaType: true,
  },
  cooking_service: {
    name: 'Nau an tai nha',
    dropdownsToFill: ['btnAmountEaterChoice', 'btnTasteByRegionChoice'],
    needsCookingSpecific: true,
    allowNoCalculatedFee: true,
  },
  elderly_care: {
    name: 'Cham soc nguoi gia',
    dropdownsToFill: ['btnMobilityCondition'],
    needsElderlySpecific: true,
    allowNoCalculatedFee: true,
  },
  baby_service: {
    name: 'Trong tre',
    dropdownsToFill: [],
    needsBabySpecific: true,
  },
  cleaning_after_construction: {
    name: 'Ve sinh sau xay dung',
    dropdownsToFill: ['btnAmountWorkerChoice'],
    allowNoCalculatedFee: true,
  },
  electrical_service: {
    name: 'He thong dien',
    dropdownsToFill: [],
    needsScheduleSelects: true,
  },
  plumbing_service: {
    name: 'He thong nuoc',
    dropdownsToFill: [],
    needsScheduleSelects: true,
  },
  furniture_service: {
    name: 'Sua noi that',
    dropdownsToFill: [],
    needsScheduleSelects: true,
  },
  locksmith: {
    name: 'Sua khoa',
    dropdownsToFill: [
      'btnLocksmithServiceTypeChoice',
      'btnLocksmithTypeChoice',
      'btnLocksmithDoorTypeChoice',
      'btnLocksmithKeyTypeChoice',
      'btnEstimateTimeChoice',
      'btnTimeFrameTimeChoice',
    ],
    allowNoCalculatedFee: true,
  },
  paint_house_service: {
    name: 'Son nha',
    dropdownsToFill: [
      'btnPaintServiceTypeChoice',
      'btnPaintTypeChoice',
      'btnTotalSquareChoice',
      'btnCurrentSituationChoice',
    ],
    allowNoCalculatedFee: true,
  },
  pest_control: {
    name: 'Phun diet con trung',
    dropdownsToFill: [
      'btnPestControlServiceTypeInsec',
      'btnPestControlServiceTypeHouse',
    ],
    needsPestSpecific: true,
  },
};

export function resolveBookingService({ serviceMode, service }, random = Math.random) {
  const serviceCodes = Object.keys(bookingServices);
  const serviceCode = serviceMode !== 'fixed' || service === 'random'
    ? serviceCodes[Math.floor(random() * serviceCodes.length)]
    : service;

  if (!bookingServices[serviceCode]) {
    throw new Error(
      `Invalid BOOKING_SERVICE "${serviceCode}". Use one of: ${serviceCodes.join(', ')} or "random".`
    );
  }

  return {
    serviceCode,
    serviceConfig: bookingServices[serviceCode],
    serviceCodes,
  };
}
