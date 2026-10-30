import { Image, View } from 'react-native';

// 영수증 썸네일 56×68 radius 10. 사진이 없으면 시안의 줄무늬 자리표시(6 muted / 4 흰색 반복).
export function ReceiptThumb({ uri }: { uri?: string | null }) {
  return (
    <View className="h-[68px] w-14 overflow-hidden rounded-[10px] border border-line bg-white">
      {uri ? (
        <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
      ) : (
        Array.from({ length: 7 }, (_, i) => <View key={i} className="mb-1 h-1.5 bg-muted" />)
      )}
    </View>
  );
}
