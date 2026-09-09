import { useLocation } from "react-router-dom";
import QualityAssuranceOMS from "../Quality Assurance/OMS";
import QualityAssurancePDM from "../Quality Assurance/PDM";
import QualityAssuranceRawMaterials from "../Quality Assurance/RawMaterials";
import QualityAssuranceNotifications from "../Quality Assurance/QANotifications";

const QualityAssurance = () => {
  const { pathname } = useLocation();

  if (pathname.startsWith("/quality_assurance/pdm")) {
    return <QualityAssurancePDM />;
  }

  if (pathname.startsWith("/quality_assurance/rawmaterials")) {
    return <QualityAssuranceRawMaterials />;
  }

  if (pathname.startsWith("/quality_assurance/notifications")) {
    return <QualityAssuranceNotifications />;
  }

  return <QualityAssuranceOMS />;
};

export default QualityAssurance;
