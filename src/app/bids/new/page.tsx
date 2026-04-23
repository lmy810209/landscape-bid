import BidEntryWithUpload from "@/components/BidEntryWithUpload";

export default function NewBidPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">입찰 등록</h1>
      <p className="text-sm text-slate-600">
        나라장터 개찰결과 PDF를 올리면 자동으로 채워집니다. 또는 아래 폼에 직접 입력하세요.
        추출 결과는 항상 자유롭게 수정할 수 있습니다.
      </p>
      <BidEntryWithUpload />
    </div>
  );
}
