// Énumérations Power Apps connues (utilisées pour l'évaluation, la validation et l'autocomplétion).

export const ENUMS = {
  Align: ['Left', 'Center', 'Right', 'Justify'],
  AlignInContainer: ['SetByContainer', 'Start', 'Center', 'End', 'Stretch'],
  Appearance: ['Primary', 'Secondary', 'Outline', 'Subtle', 'Transparent', 'Filled', 'FilledDarker', 'FilledLighter', 'Underline'],
  BorderStyle: ['None', 'Solid', 'Dashed', 'Dotted'],
  ButtonLayout: ['IconBefore', 'IconAfter', 'IconOnly', 'TextOnly'],
  ButtonAppearance: ['Primary', 'Secondary', 'Outline', 'Subtle', 'Transparent'],
  LoadingSpinner: ['None', 'Controls', 'Data'],
  Match: ['Any', 'Comma', 'Digit', 'Email', 'Hyphen', 'LeftParen', 'Letter', 'MultipleDigits', 'MultipleLetters', 'MultipleNonSpaces', 'MultipleSpaces', 'NonSpace', 'OptionalDigits', 'OptionalLetters', 'OptionalNonSpaces', 'OptionalSpaces', 'Period', 'RightParen', 'Space', 'Tab'],
  ValidationState: ['None', 'Error'],
  'ButtonCanvas.Appearance': ['Primary', 'Secondary', 'Outline', 'Subtle', 'Transparent'],
  'ButtonCanvas.Layout': ['IconBefore', 'IconAfter', 'IconOnly'],
  ColorFade: [],
  DataSourceInfo: ['AllowedValues', 'CreatePermission', 'DeletePermission', 'DisplayName', 'EditPermission', 'MaxLength', 'MaxValue', 'MinValue', 'ReadPermission', 'Required'],
  DateTimeFormat: ['LongDate', 'LongDateTime', 'LongDateTime24', 'LongTime', 'LongTime24', 'ShortDate', 'ShortDateTime', 'ShortDateTime24', 'ShortTime', 'ShortTime24', 'UTC'],
  DateTimeZone: ['Local', 'UTC'],
  Direction: ['Start', 'End'],
  DisplayMode: ['Edit', 'View', 'Disabled'],
  DropShadow: ['None', 'Light', 'Semilight', 'Regular', 'Semibold', 'Bold', 'ExtraBold'],
  ErrorKind: ['None', 'Sync', 'MissingRequired', 'CreatePermission', 'EditPermission', 'DeletePermission', 'Conflict', 'NotFound', 'ConstraintViolated', 'GeneratedValue', 'ReadOnlyValue', 'Validation', 'Unknown', 'Div0', 'BadLanguageCode', 'BadRegex', 'InvalidFunctionUsage', 'FileNotFound', 'AnalysisError', 'ReadPermission', 'NotSupported', 'InsufficientMemory', 'QuotaExceeded', 'Network', 'Numeric', 'InvalidArgument', 'Internal', 'NotApplicable', 'Timeout', 'ServiceUnavailable', 'Custom'],
  Font: ['Arial', 'Courier New', 'Dancing Script', 'Georgia', 'Great Vibes', 'Lato', 'Lato Black', 'Lato Hairline', 'Lato Light', 'Montserrat', 'Open Sans', 'Open Sans Condensed', 'Patrick Hand', 'Segoe UI', 'Verdana', 'Helvetica', 'Times New Roman', 'Trebuchet MS'],
  FontWeight: ['Normal', 'Lighter', 'Semibold', 'Bold'],
  FormMode: ['Edit', 'New', 'View'],
  GridStyle: ['All', 'None', 'Horizontal', 'Vertical'],
  IconStyle: ['Outline', 'Filled'],
  'Icon.IconStyle': ['Outline', 'Filled'],
  ImagePosition: ['Fill', 'Fit', 'Stretch', 'Tile', 'Center'],
  ImageRotation: ['None', 'Rotate90', 'Rotate180', 'Rotate270'],
  JSONFormat: ['Compact', 'IndentFour', 'IgnoreBinaryData', 'IgnoreUnsupportedTypes', 'IncludeBinaryData'],
  LabelPosition: ['Before', 'After', 'Above'],
  LaunchTarget: ['New', 'Replace'],
  ScreenSize: ['Small', 'Medium', 'Large', 'ExtraLarge'],
  Layout: ['Horizontal', 'Vertical'],
  LayoutAlignItems: ['Start', 'Center', 'End', 'Stretch'],
  LayoutDirection: ['Horizontal', 'Vertical'],
  LayoutJustifyContent: ['Start', 'Center', 'End', 'SpaceBetween', 'SpaceAround', 'SpaceEvenly'],
  LayoutMode: ['Auto', 'Manual'],
  LayoutOverflow: ['Hidden', 'Scroll'],
  ListItemTemplate: ['Single', 'Double', 'Person'],
  MatchOptions: ['BeginsWith', 'Complete', 'Contains', 'EndsWith', 'IgnoreCase', 'Multiline'],
  NotificationType: ['Error', 'Warning', 'Success', 'Information'],
  Overflow: ['Hidden', 'Scroll'],
  PenMode: ['Draw', 'Erase', 'Select'],
  RemoveFlags: ['First', 'All'],
  ScreenTransition: ['None', 'Fade', 'Cover', 'CoverRight', 'UnCover', 'UnCoverRight'],
  SelectionMethod: ['Single', 'Multiple'],
  SortOrder: ['Ascending', 'Descending'],
  StartOfWeek: ['Sunday', 'Monday', 'MondayZero', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  TeamsTheme: ['Default', 'Dark', 'Contrast'],
  TextFormat: ['Text', 'Number'],
  TextMode: ['SingleLine', 'MultiLine', 'Password'],
  TextPosition: ['Left', 'Right'],
  TextRole: ['Default', 'Heading1', 'Heading2', 'Heading3', 'Heading4'],
  'TextCanvas.Align': ['Start', 'Center', 'End', 'Justify'],
  'TextCanvas.Size': ['Small', 'Medium', 'Large'],
  'TextCanvas.VerticalAlign': ['Top', 'Middle', 'Bottom'],
  'TextCanvas.Weight': ['Regular', 'Medium', 'Semibold', 'Bold'],
  'TextInputCanvas.Appearance': ['Outline', 'Underline', 'FilledDarker', 'FilledLighter'],
  'TextInputCanvas.Mode': ['SingleLine', 'Multiline'],
  'TextInputCanvas.Type': ['Text', 'Password', 'Search'],
  TimeUnit: ['Milliseconds', 'Seconds', 'Minutes', 'Hours', 'Days', 'Months', 'Quarters', 'Years'],
  Transition: ['None', 'Pop', 'Push'],
  TriggerOutput: ['FocusOut', 'Delayed', 'WhileTyping', 'KeyPress'],
  VerticalAlign: ['Top', 'Middle', 'Bottom'],
  VirtualKeyboardMode: ['Auto', 'Numeric', 'Text'],
  Zoom: ['FitWidth', 'FitHeight', 'FitBoth'],
  // Icônes classiques
  Icon: [
    'Add', 'AddDocument', 'AddLibrary', 'AddToCalendar', 'AddUser', 'Alarm', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'BackArrow',
    'Bell', 'Blocked', 'Bookmark', 'BookmarkFilled', 'Bug', 'Calculator', 'CalendarBlank', 'Camera', 'Cancel', 'CancelBadge', 'Cars',
    'Check', 'CheckBadge', 'ChevronDown', 'ChevronLeft', 'ChevronRight', 'ChevronUp', 'Clock', 'ClearDrawing', 'Cloud', 'Columns',
    'Compose', 'Copy', 'Crop', 'Currency', 'Delete', 'Diamond', 'DockCheckProperties', 'Document', 'DocumentPDF', 'DocumentWithContent',
    'Download', 'Edit', 'EmojiFrown', 'EmojiHappy', 'EmojiNeutral', 'EmojiSad', 'EmojiSmile', 'Enhance', 'Error', 'ExpandView', 'Export',
    'Filter', 'FilterFlat', 'FilterFlatFilled', 'Flag', 'Folder', 'Globe', 'Hamburger', 'Health', 'Heart', 'HideDrawing', 'History', 'Home',
    'Import', 'Information', 'Items', 'Laptop', 'LevelsLayersItems', 'Lightbulb', 'LikeDislike', 'Link', 'Location', 'Lock', 'LogJournal',
    'Mail', 'Manufacture', 'Message', 'Microphone', 'Money', 'More', 'Note', 'Notebook', 'Phone', 'PhotosPictures', 'Pictures', 'Pin', 'Print',
    'QuestionMark', 'Reload', 'Reset', 'Save', 'Search', 'Send', 'Settings', 'Share', 'ShoppingCart', 'Sort', 'SortUpDown', 'Splitscreen',
    'Star', 'StarFilled', 'Stop', 'Support', 'Tablet', 'Text', 'ThumbsDown', 'ThumbsDownFilled', 'ThumbsUp', 'ThumbsUpFilled', 'Tools',
    'Trash', 'Undo', 'Unlock', 'Upload', 'User', 'View', 'Video', 'Waypoint', 'Warning', 'Weather', 'Wifi', 'ZoomIn', 'ZoomOut',
    'Leave', 'Shirt', 'Train', 'Airplane', 'Bus', 'Hospital', 'Robot', 'Dashboard', 'Calendar',
  ],
};

export const ENUM_NAMES = Object.keys(ENUMS);
const ENUM_INDEX = new Map(ENUM_NAMES.map((n) => [n.toLowerCase(), n]));

export function findEnum(name) {
  return ENUM_INDEX.get(String(name).toLowerCase()) || null;
}

export function enumHasMember(ns, member) {
  const list = ENUMS[ns];
  if (!list || list.length === 0) return true;
  const m = String(member).toLowerCase();
  return list.some((x) => x.toLowerCase() === m);
}

/** Valeurs CSS associées aux énumérations de mise en forme */
export const SHADOWS = {
  none: 'none',
  light: '0 1px 2px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)',
  semilight: '0 2px 4px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)',
  regular: '0 4px 8px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)',
  semibold: '0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)',
  bold: '0 14px 28px rgba(0,0,0,0.24), 0 0 8px rgba(0,0,0,0.2)',
  extrabold: '0 28px 64px rgba(0,0,0,0.24), 0 0 8px rgba(0,0,0,0.2)',
};
